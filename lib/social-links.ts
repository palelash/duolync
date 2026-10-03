/**
 * lib/social-links.ts
 *
 * Shared utility for parsing CreatorProfile.socialLinks (Json field).
 *
 * Two storage formats exist in the database:
 *   Legacy array format:  [{platform: string, url: string}, ...]
 *   Import object format: {instagram: "url", tiktok: "url", ...}
 *
 * Returns a normalized Record<platform (lowercase-trimmed), url> mapping.
 * Filters out empty / invalid-looking entries so callers get clean data.
 */

/**
 * Parses the raw socialLinks JSON value into a consistent
 * `Record<platform, url>` mapping.
 *
 * Platform keys are always lowercase-trimmed.
 * Empty or invalid URLs are excluded.
 */
export function parseSocialLinks(raw: unknown): Record<string, string> {
  if (!raw) return {};

  const result: Record<string, string> = {};

  if (Array.isArray(raw)) {
    // Legacy array format: [{platform, url}, ...]
    for (const item of raw as { platform?: unknown; url?: unknown }[]) {
      const platform =
        typeof item?.platform === "string"
          ? item.platform.toLowerCase().trim()
          : "";
      const url =
        typeof item?.url === "string" ? item.url.trim() : "";
      if (platform && url && isValidSocialUrl(url)) {
        result[platform] = url;
      }
    }
  } else if (raw !== null && typeof raw === "object") {
    // Import object format: {instagram: "url", tiktok: "url", ...}
    for (const [key, val] of Object.entries(
      raw as Record<string, unknown>,
    )) {
      const platform = key.trim().toLowerCase();
      const url = typeof val === "string" ? val.trim() : "";
      if (platform && url && isValidSocialUrl(url)) {
        result[platform] = url;
      }
    }
  }

  return result;
}

/**
 * Returns the set of platform names present in a socialLinks value.
 * All keys are lowercase-normalised.
 */
export function socialLinksPlatforms(raw: unknown): string[] {
  return Object.keys(parseSocialLinks(raw));
}

// ─── Internal ─────────────────────────────────────────────────────────────────

/**
 * Minimal URL sanity check — must start with http/https or contain a dot.
 * Rejects placeholder dashes and empty strings.
 */
function isValidSocialUrl(url: string): boolean {
  if (!url) return false;
  if (url === "-" || url === "—" || url === "N/A") return false;
  return (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.includes(".")
  );
}
