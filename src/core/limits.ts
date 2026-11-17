// src/core/limits.ts
// Limits and ids every layer shares: validation, storage, the broker, the MCP layer and the adapters.

/** Every bound on what a batch or a follow-up may hold, shared by the broker, the MCP layer and adapters. */
export const LIMITS = {
  note: 2000,
  label: 120,
  text: 256,
  issues: 500,
  path: 12,
  classes: 8,
  /** Files an agent result may name, each at most `text` characters. */
  files: 50,
  /** Checks an agent result may list, and the length of each command. */
  checks: 20,
  command: 200,
  /** A short name: a tag, a class, a provenance, a preset id, a choice, a MIME type. */
  name: 64,
  /** One step of an element's ancestor path. */
  pathStep: 128,
  component: 128,
  /** A project-relative source file. */
  file: 512,
  /** Group members whose compared properties the evidence lists. */
  members: 64,
  /** How far a region's corner may lie from the element it was drawn on, in CSS px. */
  offset: 1_000_000,
}

/** The characters of every id: batches, issues, attachments, follow-ups, projects. */
const ID_CHARS = '[A-Za-z0-9_-]'
/** An id's characters and length. */
export const ID_BODY = `${ID_CHARS}{1,64}`
export const ID = new RegExp(`^${ID_BODY}$`)
/** An agent's own result id, short enough for the `res_` prefix to keep it a valid id. */
export const RESULT_ID = new RegExp(`^${ID_CHARS}{1,40}$`)

export function isId(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value)
}
