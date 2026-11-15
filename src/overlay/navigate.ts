// src/overlay/navigate.ts
// Where the inspector goes when an issue is opened from a plate, a row or the history.

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
