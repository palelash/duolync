import { Role } from "@/lib/generated/prisma";

/** Public API / Better Auth client convention (lowercase). */
export type UserType = "brand" | "creator" | "admin";

/**
 * Normalize any role value (string, enum, null, undefined) into the exact
 * PostgreSQL enum string that Prisma expects.
 *
 * ⚠️  Do NOT compare against `Role.ADMIN` / `Role.BRAND` / `Role.CREATOR` here.
 * Those references resolve to `undefined` when Next.js hot-reload serves a
 * stale Prisma module that pre-dates `pnpm db:generate`, turning
 * `role === Role.ADMIN` into `role === undefined` — a silent bug that corrupts
 * user creation and triggers ?error=internal_server_error in Better Auth.
 *
 * Always compare against the string literals ("ADMIN", "BRAND", "CREATOR").
 */
export function toPrismaRole(role: unknown): Role {
  const r = String(role ?? "").toUpperCase().trim();
  if (r === "BRAND") return "BRAND" as Role;
  if (r === "ADMIN") return "ADMIN" as Role;
  return "CREATOR" as Role;
}

/** Map Prisma `Role` (or raw strings) to the public lowercase UserType. */
export function fromPrismaRole(role: Role | string | null | undefined): UserType {
  const r = String(role ?? "").toUpperCase().trim();
  if (r === "BRAND") return "brand";
  if (r === "ADMIN") return "admin";
  return "creator";
}

/**
 * Quick predicate — safe in both Node.js and Edge runtimes.
 * Uses string comparison, NOT Role.ADMIN, to avoid stale-module issues.
 */
export function isAdmin(role: Role | string | null | undefined): boolean {
  return String(role ?? "").toUpperCase().trim() === "ADMIN";
}
