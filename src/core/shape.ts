// src/core/shape.ts
// The primitive shape tests every validator is built from.

import { LIMITS } from './limits'

export type Obj = Record<string, unknown>

export function isObj(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
export const isNum = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
export const isStr = (value: unknown, max = LIMITS.text): value is string => {
  return typeof value === 'string' && value.length <= max
}
export const oneOf = (set: ReadonlySet<string>, value: unknown) => typeof value === 'string' && set.has(value)
export const hasNumbers = (value: unknown, keys: readonly string[]) => {
  return isObj(value) && keys.every(key => isNum(value[key]))
}

/** A list of at most `max` strings, each at most `length` long. */
export function isBoundedList(value: unknown, max: number, length: number): boolean {
  return Array.isArray(value) && value.length <= max && value.every(item => isStr(item, length))
}

/** An object whose values are strings, each at most `length` long. */
export function isStringMap(value: unknown, length: number = LIMITS.text): boolean {
  return isObj(value) && Object.values(value).every(item => isStr(item, length))
}

/** Adds one problem and returns the list: for a shape too broken to check further. */
export function stop(out: string[], problem: string): string[] {
  out.push(problem)
  return out
}
