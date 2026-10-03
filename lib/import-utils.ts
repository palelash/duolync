/**
 * lib/import-utils.ts
 *
 * Shared utilities for the Admin Imported Creator Builder.
 * Used by createImportedCreatorAction, updateImportedCreatorAction, and
 * their duplicate-detection helpers.
 *
 * All functions are pure (no DB access, no side effects) so they are safe
 * to import in both server actions and client components.
 */

import { parseSocialLinks } from "@/lib/social-links";

// ─── URL normalization ────────────────────────────────────────────────────────

/** Prepend https:// if the raw value has no scheme. Trims whitespace first. */
export function normaliseUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

// ─── Avatar URL validation ────────────────────────────────────────────────────

/**
 * Returns true only for valid HTTPS URLs.
 * Rejects: http, data:, blob:, javascript:, and malformed values.
 */
export function isValidAvatarUrl(url: string): boolean {
  const s = url.trim();
  if (!s) return false;
  try {
    const parsed = new URL(s);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// ─── Social link URL validation ───────────────────────────────────────────────

/**
 * Returns true for http or https URLs that can be normalised.
 * Used to gate social link inputs before storing.
 */
export function isValidSocialLinkUrl(raw: string): boolean {
  if (!raw.trim()) return false;
  const normalised = normaliseUrl(raw.trim());
  try {
    const parsed = new URL(normalised);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

// ─── importedEmail gate ───────────────────────────────────────────────────────

/**
 * Conservative gate: returns true only when the value looks like a real
 * contact email address.
 *
 * Rejects:
 * - Empty / whitespace-containing values
 * - Human-readable notes ("Booking email in bio", "DM for collabs", etc.)
 * - Placeholder domains (@import.nexly.internal, @placeholder.duolync.invalid)
 * - Values with multiple or no @ characters
 */
export function isTrustableImportedEmail(
  value: string | null | undefined,
): boolean {
  if (!value) return false;
  if (/\s/.test(value)) return false;
  const atIdx = value.indexOf("@");
  if (atIdx < 1) return false;
  if (atIdx !== value.lastIndexOf("@")) return false;
  const local = value.slice(0, atIdx);
  const domain = value.slice(atIdx + 1);
  if (!local || !domain) return false;
  if (domain === "import.nexly.internal") return false;
  if (domain === "placeholder.duolync.invalid") return false;
  return true;
}

// ─── Handle extraction for social dedup ──────────────────────────────────────

/**
 * Extracts a normalised handle/path from a social profile URL for exact-match
 * duplicate detection.
 *
 * Normalisation steps:
 * 1. Trim + normalise scheme (add https:// if missing)
 * 2. Remove scheme
 * 3. Remove www.
 * 4. Remove query string and hash
 * 5. Remove trailing slash
 * 6. Remove platform-specific domain prefix
 * 7. Remove leading @
 * 8. Remove trailing slash (again, after domain strip)
 * 9. Lowercase entire result
 *
 * Returns null if the URL is empty or yields an empty handle (fail-open —
 * never block on ambiguous inputs).
 *
 * YouTube note: multiple URL forms are handled (@handle, /c/name, /user/name,
 * /channel/UCxxx). If none match, returns null (fail-open) rather than
 * blocking a potentially different creator.
 */
export function extractHandle(url: string, platform: string): string | null {
  if (!url) return null;
  const raw = normaliseUrl(url.trim());
  if (!raw) return null;

  let h = raw;

  // 1. Strip scheme
  h = h.replace(/^https?:\/\//i, "");
  // 2. Strip www.
  h = h.replace(/^www\./i, "");
  // 3. Strip query string and hash
  h = h.replace(/[?#].*$/, "");
  // 4. Strip trailing slash
  h = h.replace(/\/+$/, "");

  const lp = platform.toLowerCase();

  if (lp === "instagram") {
    h = h.replace(/^instagram\.com\/?/i, "");
  } else if (lp === "tiktok") {
    // tiktok.com/@handle  OR  tiktok.com/handle  OR  vm.tiktok.com/shortcode
    h = h.replace(/^tiktok\.com\/@?/i, "");
    h = h.replace(/^vm\.tiktok\.com\//i, "");
    // If h still starts with tiktok.com, strip generically
    h = h.replace(/^tiktok\.com\//i, "");
  } else if (lp === "youtube") {
    // Supported forms:
    //   youtube.com/@handle
    //   youtube.com/c/name
    //   youtube.com/user/name
    //   youtube.com/channel/UCxxxx
    //   youtu.be/shortcode (not a profile URL; fail-open)
    if (/^youtube\.com\/@/i.test(h)) {
      h = h.replace(/^youtube\.com\/@/i, "");
    } else if (/^youtube\.com\/c\//i.test(h)) {
      h = h.replace(/^youtube\.com\/c\//i, "");
    } else if (/^youtube\.com\/user\//i.test(h)) {
      h = h.replace(/^youtube\.com\/user\//i, "");
    } else if (/^youtube\.com\/channel\//i.test(h)) {
      h = h.replace(/^youtube\.com\/channel\//i, "");
    } else if (/^youtu\.be\//i.test(h)) {
      // Short links are not profile URLs — fail-open
      return null;
    } else if (/^youtube\.com/i.test(h)) {
      // Unrecognised YouTube URL form — fail-open rather than falsely blocking
      return null;
    }
  } else if (lp === "threads") {
    h = h.replace(/^threads\.net\/@?/i, "");
    h = h.replace(/^threads\.net\//i, "");
  }

  // Strip leading @
  h = h.replace(/^@/, "");
  // Strip trailing slash again (after domain removal)
  h = h.replace(/\/+$/, "");
  // Lowercase for case-insensitive comparison
  h = h.toLowerCase();

  return h || null;
}

// ─── Social dedup helper ──────────────────────────────────────────────────────

/**
 * Extracts all normalised handles for a given platform from a socialLinks
 * JSON value. Handles both storage formats:
 *   - Array: [{platform: "instagram", url: "https://..."}]
 *   - Legacy object: {instagram: "https://...", ...}
 *
 * Uses parseSocialLinks to normalise the format first.
 */
export function extractHandlesFromSocialLinks(
  raw: unknown,
  platform: string,
): string[] {
  // parseSocialLinks handles both array and object formats
  const parsed = parseSocialLinks(raw);
  const url = parsed[platform.toLowerCase()];
  if (!url) return [];
  const handle = extractHandle(url, platform);
  return handle ? [handle] : [];
}
