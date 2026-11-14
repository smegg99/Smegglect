// src/overlay/navigate.ts
// Where the inspector goes when an issue or the report is opened from a plate, a row, the history or an export.

import type { Ui } from './runtime'

/** Shows one issue in the inspector; Back returns to the tab it was opened from. */
export function openIssue(ui: Ui, id: string): void {
  if (ui.view === 'element' || ui.view === 'issues' || ui.view === 'history') ui.back = ui.view
  ui.issue = id
  ui.view = 'issue'
  ui.inspector = true
}

export function closeIssue(ui: Ui): void {
  if (ui.view === 'issue') ui.view = ui.back
  ui.issue = null
}

/** The report for the drafts (batchId null) or a submitted batch, optionally with a failure note. */
export function openReport(ui: Ui, report: NonNullable<Ui['report']>): void {
  ui.report = report
  ui.view = 'report'
  ui.inspector = true
}

export function closeReport(ui: Ui): void {
  ui.report = null
  if (ui.view === 'report') ui.view = 'issues'
}
