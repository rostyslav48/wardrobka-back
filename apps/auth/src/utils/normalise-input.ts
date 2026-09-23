/**
 * Shared by the DTOs (belt) and by UsersService's write/lookup paths (suspenders,
 * QA-15/QA-16) — a value must reach the same normal form no matter which side
 * of a class-validator pipeline it comes through.
 */
export function normaliseEmail(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}
