// src/core/lookup.ts
// Reading a table by a key that came from outside: only the table's own keys count.

/** A value from a table by its own key; a key the table does not hold, `toString` included, is undefined. */
export function lookup<T>(table: Readonly<Record<string, T>>, key: string | undefined): T | undefined {
  return key !== undefined && Object.hasOwn(table, key) ? table[key] : undefined
}
