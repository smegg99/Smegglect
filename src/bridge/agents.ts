// src/bridge/agents.ts
// Who is working, kept in memory from calls agents make anyway: a hello, the work list, `wait`.
// The page learns words from a fixed set: never an agent's own text.

import type { IssueProgress, IssueState } from '../core/review'

/** The agent software, reduced to a word the page knows: Claude Code, or any other agent. */
export type AgentKind = 'claude' | 'other'

/** An agent as its requests name it. */
export interface AgentHello {
  id: string
  kind: AgentKind
}

interface Agent {
  kind: AgentKind
  lastSeen: number
  /** Open `wait` requests. */
  listening: number
}

/** What the page shows: whether an agent listens, and how far each sent batch has got. */
export interface AgentStatus {
  listening: boolean
  /** The agent the page names: the one listening, else the one seen last. */
  kind: AgentKind | null
  /** Milliseconds since that agent was last seen. */
  lastSeenAgo: number | null
}

export type BatchProgress = 'waiting' | 'taken' | 'stalled' | 'done'

export interface Agents {
  /** Any call an agent makes is a hello. */
  seen: (hello: AgentHello) => void
  /** Wraps one `wait`: the agent counts as listening while it is held. */
  listen: <T>(hello: AgentHello, work: () => Promise<T>) => Promise<T>
  /** The agent, still alive, that holds the issue; null when none does. */
  holder: (issueKey: string) => string | null
  claim: (agentId: string, issueKeys: readonly string[]) => void
  received: (agentId: string, batchId: string) => void
  status: () => AgentStatus
  /** `done` when every issue of the batch has a result; the caller knows that. */
  progress: (batchId: string, finished: boolean) => BatchProgress
  /** One sent issue: its result, else whether an agent still alive holds it or its batch. */
  issueProgress: (batchId: string, issueId: string, state: IssueState) => IssueProgress
}

export const issueKey = (batchId: string, issueId: string) => `${batchId}/${issueId}`

/** How long an agent may be silent before it is forgotten; its batches then wait for an agent again. */
const FORGET_MS = 60 * 60_000

/** Forgets the agents silent for `after` ms, and what each of `held` (keys to agent ids) says they hold. */
function forgetSilent(agents: Map<string, Agent>, held: readonly Map<string, string>[], after: number): void {
  const now = Date.now()
  for (const [id, agent] of agents) {
    if (agent.listening > 0 || now - agent.lastSeen < after) continue
    agents.delete(id)
    for (const map of held) for (const [key, holder] of map) if (holder === id) map.delete(key)
  }
}

/** Listening now, or seen within `timeoutMs`. */
function isAlive(agent: Agent | undefined, timeoutMs: number): boolean {
  return !!agent && (agent.listening > 0 || Date.now() - agent.lastSeen < timeoutMs)
}

/** One sent issue: its result, else held while one of `holders` lives, and stalled once they went quiet. */
function issueProgressOf(
  state: IssueState,
  holders: readonly (string | undefined)[],
  alive: (id: string | undefined) => boolean,
  anyAlive: boolean,
): IssueProgress {
  if (state !== 'submitted' && state !== 'in-progress') return state
  const known = holders.filter(id => id !== undefined)
  if (known.some(alive)) return state === 'submitted' ? 'taken' : 'in-progress'
  if (state === 'submitted') return known.length > 0 ? 'stalled' : 'waiting'
  // Begun with no holder known, as after the broker restarted: in progress while any agent is still there.
  return known.length === 0 && anyAlive ? 'in-progress' : 'stalled'
}

/** The agent the page names: the one listening, else the one seen last. */
function statusOf(agents: ReadonlyMap<string, Agent>): AgentStatus {
  const listening = [...agents.values()].find(agent => agent.listening > 0)
  const named = listening ?? [...agents.values()].sort((a, b) => b.lastSeen - a.lastSeen)[0]
  return {
    listening: !!listening,
    kind: named?.kind ?? null,
    lastSeenAgo: named ? Date.now() - named.lastSeen : null,
  }
}

/** Records that `agentId` holds `key`; true when that is news. */
function hold(map: Map<string, string>, key: string, agentId: string): boolean {
  if (map.get(key) === agentId) return false
  map.set(key, agentId)
  return true
}

/** Agents silent for `timeoutMs` are gone: their claims return to the queue and their batches stall. */
export function createAgents(timeoutMs: number, changed: () => void): Agents {
  const agents = new Map<string, Agent>()
  const claims = new Map<string, string>()
  const receivedBy = new Map<string, string>()
  const forget = () => forgetSilent(agents, [claims, receivedBy], Math.max(FORGET_MS, timeoutMs))
  const alive = (id: string | undefined) => isAlive(id === undefined ? undefined : agents.get(id), timeoutMs)
  const seen = (hello: AgentHello) => {
    forget()
    const known = agents.get(hello.id)
    // In place: a `wait` this agent has open counts its own record down when it ends.
    agents.set(hello.id, Object.assign(known ?? { listening: 0 }, { kind: hello.kind, lastSeen: Date.now() }))
    if (!known) changed()
  }
  return {
    seen,
    async listen(hello, work) {
      seen(hello)
      const agent = agents.get(hello.id) ?? { kind: hello.kind, lastSeen: Date.now(), listening: 0 }
      agents.set(hello.id, agent)
      agent.listening++
      changed()
      try {
        return await work()
      }
      finally {
        agent.listening--
        agent.lastSeen = Date.now()
        changed()
      }
    },
    holder(key) {
      const held = claims.get(key)
      return held !== undefined && alive(held) ? held : null
    },
    // The page hears of issues that change hands, as of batches.
    claim(agentId, issueKeys) {
      if (issueKeys.map(key => hold(claims, key, agentId)).includes(true)) changed()
    },
    received(agentId, batchId) {
      if (hold(receivedBy, batchId, agentId)) changed()
    },
    status() {
      forget()
      return statusOf(agents)
    },
    progress(batchId, finished) {
      forget()
      if (finished) return 'done'
      const holder = receivedBy.get(batchId)
      if (holder === undefined) return 'waiting'
      return alive(holder) ? 'taken' : 'stalled'
    },
    issueProgress(batchId, issueId, state) {
      forget()
      const holders = [claims.get(issueKey(batchId, issueId)), receivedBy.get(batchId)]
      return issueProgressOf(state, holders, alive, [...agents.keys()].some(alive))
    },
  }
}
