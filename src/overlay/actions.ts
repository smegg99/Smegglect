// src/overlay/actions.ts
// What can be reported about a selection: fixed groups in a fixed order, never reshuffled by use.

import type { PresetRegistry } from '../core/presets'
import type { PresetUse } from './settings'

export type GroupId = 'favourites' | 'size' | 'fit' | 'align' | 'look' | 'access' | 'differs' | 'other' | 'project'
export type TargetKind = 'dom' | 'group' | 'region'

export interface Tile {
  preset: string
  /** Pre-made choice, for favourites. */
  params: Record<string, string>
  icon: string
  label: string
  /** The preset will ask for a second element. */
  needsB: boolean
}

export interface TileGroup {
  id: GroupId
  tiles: Tile[]
}

/** Each built-in preset belongs to exactly one group, so no action appears twice. */
const GROUPS: readonly [GroupId, readonly string[]][] = [
  ['size', ['size', 'spacing', 'touch-target', 'off-scale']],
  ['fit', ['clipped', 'overflow', 'overlap', 'text-wrap']],
  ['align', ['group-align', 'equal-gaps', 'align', 'center', 'match-height', 'match-width']],
  ['look', ['readability', 'text-wrong', 'wrong-color', 'icon']],
  ['access', ['feedback', 'state-missing', 'keyboard', 'a11y-name']],
  ['differs', ['consistent-padding', 'consistent-margin', 'consistent-gap', 'consistent-size', 'consistent-radius', 'consistent-type', 'consistent-color', 'inconsistent']],
  ['other', ['responsive', 'layout', 'note']],
]

export function actionGroups(
  registry: PresetRegistry,
  kind: TargetKind,
  favourites: readonly PresetUse[],
  label: (id: string, group: GroupId, params: Record<string, string>) => string,
): TileGroup[] {
  const tile = (id: string, group: GroupId, params: Record<string, string> = {}): Tile | null => {
    const def = registry.byId.get(id)
    if (!def || !def.applies.includes(kind)) return null
    const needsB = def.operands === 'reference' || (def.operands === 'compare' && kind === 'dom')
    return { preset: id, params, icon: def.icon, label: label(id, group, params), needsB }
  }
  const pick = (group: GroupId, list: readonly (readonly [string, Record<string, string>?])[]) => ({ id: group, tiles: list.map(([id, params]) => tile(id, group, params)).filter((t): t is Tile => t !== null) })
  const groups = [
    pick('favourites', favourites.map(u => [u.preset, u.params] as const)),
    ...GROUPS.map(([group, list]) => pick(group, list.map(id => [id] as const))),
    pick('project', registry.list.filter(d => d.id.startsWith('project.')).map(d => [d.id] as const)),
  ]
  return groups.filter(g => g.tiles.length > 0)
}
