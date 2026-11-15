// src/bridge/mcp.ts
// Stdio MCP server over the broker. Read submitted batches, report results; never accept, never run commands.
// Each tool is one operation from operations.ts; the CLI commands are the same operations.

import { randomBytes } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { AGENT_STATES, CHECK_OUTCOMES } from '../core/model'
import { createRegistry } from '../core/presets'
import { ID, LIMITS, RESULT_ID } from '../core/limits'
import { brokerClient, type AgentIdentity, type BrokerClient } from './client'
import * as operations from './operations'

/** A tool answer: one text part. A type, not an interface, so it meets the SDK's index signature. */
type Text = { content: { type: 'text', text: string }[], isError?: boolean }

/** A tool answer that carries an image after its text. */
type Picture = {
  content: ({ type: 'text', text: string } | { type: 'image', data: string, mimeType: string })[]
  isError?: boolean
}

/** The answer's text, then one more line when the bridge is another version than this server. */
async function answer(client: BrokerClient, pending: Promise<operations.Outcome>): Promise<Text> {
  const outcome = await pending
  const content: Text['content'] = [{ type: 'text', text: operations.render(outcome) }]
  const warning = await operations.versionWarning(client)
  if (warning) content.push({ type: 'text', text: warning })
  return { content, isError: !outcome.ok || undefined }
}

async function pictureAnswer(client: BrokerClient, batchId: string, imageId: string): Promise<Picture> {
  const outcome = await operations.image(client, batchId, imageId)
  if (!outcome.ok) return answer(client, Promise.resolve(outcome))
  const { path, mime, data } = outcome.value
  const text = `${path} (${mime}): attached and approved by the person; not redacted.`
  const content: Picture['content'] = [{ type: 'text', text }, { type: 'image', data, mimeType: mime }]
  const warning = await operations.versionWarning(client)
  if (warning) content.push({ type: 'text', text: warning })
  return { content }
}

const id = () => z.string().regex(ID)
const issueInput = { batch_id: id(), issue_id: id() }

function registerBatchTools(server: McpServer, client: BrokerClient): void {
  const registry = createRegistry()
  server.registerTool('list_batches', {
    description: 'List batches a person explicitly submitted from the Smegglect overlay,'
      + ' with each issue\'s state. Drafts are never listed.',
    inputSchema: {},
  }, () => answer(client, operations.listBatches(client)))

  server.registerTool('get_batch', {
    description: 'Summary of one submitted batch: for each issue its task, scope, constraints, note,'
      + ' target A, reference B, the viewport it was seen at and its approved images.'
      + ' Fetch full evidence with get_issue_evidence.',
    inputSchema: { batch_id: id() },
  }, ({ batch_id }) => answer(client, operations.getBatch(client, registry, batch_id)))

  server.registerTool('get_issue_evidence', {
    description: 'Full captured evidence of one issue: capture conditions, bounds, computed properties,'
      + ' relation between A and B and context, its follow-ups and state,'
      + ' and its batch\'s project, provider and submitted time. Not the other issues of the batch.',
    inputSchema: issueInput,
  }, ({ batch_id, issue_id }) => answer(client, operations.issueEvidence(client, batch_id, issue_id)))

  server.registerTool('get_attachment', {
    description: 'One image the person attached to an issue, as image content. The person approved it'
      + ' before sending; it is not redacted. get_batch and get_issue_evidence list each issue\'s images'
      + ' with a path under the project you can open instead.',
    inputSchema: { batch_id: id(), attachment_id: id() },
  }, ({ batch_id, attachment_id }) => pictureAnswer(client, batch_id, attachment_id))

  server.registerTool('next_work', {
    description: 'Issues waiting for you: sent and not yet answered. Each has what you need to begin:'
      + ' batch_id, issue_id, the task, the person\'s note, the scope, the target A, its source file'
      + ' and the viewport and colour scheme it was seen at, and how many images the person attached.'
      + ' A region that names the elements in it has `contents`: inside or touching, their files, the'
      + ' total; start from those files.'
      + ' Empty when there is nothing to do.'
      + ' The issues listed are yours until you report them; another agent does not get them.'
      + ' Pass claim: false to look without taking them. `link` has the versions and the open pages.',
    inputSchema: { claim: z.boolean().optional() },
  }, ({ claim }) => answer(client, operations.nextWork(client, claim !== false)))
}

function registerPageTools(server: McpServer, client: BrokerClient): void {
  server.registerTool('check_issue', {
    description: 'Ask the open app page to find the issue\'s target again and re-measure it now.'
      + ' Returns whether the target is on the page, its current bounds and properties,'
      + ' what changed since the report, and the A/B comparison where the issue has one.'
      + ' Use it after a change to see the result.',
    inputSchema: issueInput,
  }, ({ batch_id, issue_id }) => answer(client, operations.checkIssue(client, batch_id, issue_id)))

  server.registerTool('get_selection', {
    description: 'What the person has selected in the open app page right now: the element description,'
      + ' source location when known, size and box values.'
      + ' Use it when the person says "this" or "the selected element".',
    inputSchema: {},
  }, () => answer(client, operations.selection(client)))
}

const reportInput = {
  ...issueInput,
  state: z.enum(AGENT_STATES),
  summary: z.string().max(LIMITS.note).optional(),
  files: z.array(z.string().max(LIMITS.text)).max(LIMITS.files).optional(),
  checks: z.array(z.object({
    command: z.string().max(LIMITS.command),
    outcome: z.enum(CHECK_OUTCOMES),
  })).max(LIMITS.checks).optional(),
  result_id: z.string().regex(RESULT_ID).optional(),
}

function registerReportTool(server: McpServer, client: BrokerClient): void {
  server.registerTool('report_result', {
    description: 'Record the state of one issue you were given, which takes it out of the work queue.'
      + ' Allowed states: in-progress, partial, blocked, needs-review. Only the state is needed:'
      + ' say what you did in your reply to the person, not here; summary, files and checks are'
      + ' optional and the page does not show them. Pass result_id to make retries idempotent.',
    inputSchema: reportInput,
  }, input => answer(client, operations.reportResult(client, {
    batchId: input.batch_id,
    issueId: input.issue_id,
    state: input.state,
    summary: input.summary,
    files: input.files,
    checks: input.checks,
    resultId: input.result_id,
  })))
}

function createMcp(client: BrokerClient, version: string): McpServer {
  const server = new McpServer({ name: 'smegglect', version })
  registerBatchTools(server, client)
  registerPageTools(server, client)
  registerReportTool(server, client)
  return server
}

/** How often a running MCP server says it is still there, so its issues stay its own. */
const HELLO_MS = 60_000

/**
 * Says hello once connected, naming the MCP client, and again every minute while the process lives:
 * a killed session goes quiet, and its issues return to the queue.
 */
export async function runMcp(root: string, version: string): Promise<void> {
  const agent: AgentIdentity = { id: `mcp_${randomBytes(6).toString('hex')}`, client: 'unknown' }
  const client = brokerClient(root, agent)
  const server = createMcp(client, version)
  const hello = () => client.post('/v1/agents/hello', {}).catch(() => {
    // No bridge yet, or it did not answer: the next hello or tool call tries again.
  })
  server.server.oninitialized = () => {
    agent.client = server.server.getClientVersion()?.name ?? 'unknown'
    void hello()
  }
  setInterval(hello, HELLO_MS).unref()
  await server.connect(new StdioServerTransport())
}
