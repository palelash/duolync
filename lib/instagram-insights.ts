/**
 * lib/instagram-insights.ts
 *
 * Server-only module for Instagram Insights API (V1).
 *
 * This module MUST never be imported in client components.
 * It MUST never log access tokens, token-containing URLs,
 * raw provider error_description strings, or authorization credentials.
 *
 * API reference:
 *   graph.instagram.com/{ig-user-id}/insights   — account-level metrics
 *   graph.instagram.com/{media-id}/insights     — media-level metrics
 *
 * Parsing contract:
 *   • Explicit provider value 0 is preserved as 0 (never coerced to null).
 *   • An empty `data` response becomes null/unavailable, NOT numeric zero.
 *   • A metric absent from the response array returns null (never fabricated).
 *
 * @server-only — Do NOT import this file in client components (pages/hooks/UI).
 *                This module calls the Instagram Graph API using a secret token.
 */
import { Prisma } from "@/lib/generated/prisma";
import { INSTAGRAM_GRAPH } from "./instagram-auth";

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * Reflects the state of the instagram_business_manage_insights permission.
 *
 *   "granted"  — API responded successfully; insights data is available.
 *   "missing"  — API returned a known permission-error code (10 / 200 / 190).
 *   "unknown"  — Network error, unexpected status, or parse failure.
 */
export type InsightsPermissionState = "granted" | "missing" | "unknown";

/**
 * 28-day rolling account insights snapshot.
 *
 * All metric fields are number | null:
 *   number  — confirmed value, including 0.
 *   null    — metric absent from provider response or data array was empty.
 */
export interface AccountInsightsSnapshot {
  windowDays: 28;
  since: number;   // unix epoch seconds (start of window)
  until: number;   // unix epoch seconds (end of window)
  fetchedAt: string; // ISO 8601 timestamp
  reach: number | null;
  views: number | null;
  profileViews: number | null;
  accountsEngaged: number | null;
  totalInteractions: number | null;
}

/** Return type of fetchAccountInsights. */
export interface AccountInsightsResult {
  /** true if the HTTP call completed without error and the API responded. */
  available: boolean;
  permissionState: InsightsPermissionState;
  /**
   * Populated when available === true and the API returned at least one
   * metric in the data array.
   * null when available === true but data was empty (not enough data).
   */
  snapshot: AccountInsightsSnapshot | null;
}

/**
 * Lifetime per-media insight metrics.
 *
 * All metric fields are number | null.
 * A null value means the metric was absent in the provider response
 * (e.g., unsupported for that media type) — never a fabricated zero.
 */
export interface MediaInsightsMetrics {
  views: number | null;
  reach: number | null;
  shares: number | null;
  /** Correct API metric name is `saved`, not `saves`. */
  saved: number | null;
  profileVisits: number | null;
}

/** Return type of fetchMediaInsights. */
export interface MediaInsightsResult {
  available: boolean;
  permissionState: InsightsPermissionState;
  /**
   * Populated when available === true and the API returned at least one
   * metric in the data array.
   * null when available === true but data was empty (no data for this media).
   */
  metrics: MediaInsightsMetrics | null;
}

// ─── Internal constants ───────────────────────────────────────────────────────

const WINDOW_DAYS = 28 as const;

/**
 * Meta API error codes that indicate the requesting app lacks the
 * instagram_business_manage_insights permission.
 * Code 10  = Application does not have permission.
 * Code 200 = Permissions error.
 * Code 190 = Invalid OAuth access token.
 *
 * We intentionally do NOT log the raw error_description string.
 */
const INSIGHTS_PERMISSION_CODES = new Set([10, 200, 190]);

// ─── Safe parsing helpers ─────────────────────────────────────────────────────

/**
 * Extracts a `total_value.value` from an account insights data array.
 *
 * Returns null when:
 *   • The metric name is not present in data.
 *   • total_value is missing or malformed.
 *   • value is not a number.
 *
 * Explicit 0 is returned as 0.
 */
export function extractTotalValue(
  data: unknown[],
  metricName: string,
): number | null {
  const item = data.find(
    (d): d is Record<string, unknown> =>
      typeof d === "object" &&
      d !== null &&
      (d as Record<string, unknown>)["name"] === metricName,
  );
  if (!item) return null;

  const tv = item["total_value"];
  if (typeof tv !== "object" || tv === null) return null;

  const value = (tv as Record<string, unknown>)["value"];
  // typeof check ensures we accept 0 but not undefined/null/string
  return typeof value === "number" ? value : null;
}

/**
 * Extracts a lifetime metric value from a media insights data array.
 *
 * Tries `total_value.value` first (used by some endpoints),
 * then falls back to `values[0].value`.
 *
 * Returns null when:
 *   • The metric name is not present in data.
 *   • Both value paths are missing or malformed.
 *   • The value is not a number.
 *
 * Explicit 0 is returned as 0.
 */
export function extractLifetimeValue(
  data: unknown[],
  metricName: string,
): number | null {
  const item = data.find(
    (d): d is Record<string, unknown> =>
      typeof d === "object" &&
      d !== null &&
      (d as Record<string, unknown>)["name"] === metricName,
  );
  if (!item) return null;

  // Path 1: total_value.value
  const tv = item["total_value"];
  if (typeof tv === "object" && tv !== null) {
    const v = (tv as Record<string, unknown>)["value"];
    if (typeof v === "number") return v;
  }

  // Path 2: values[0].value
  const values = item["values"];
  if (Array.isArray(values) && values.length > 0) {
    const first = values[0] as Record<string, unknown> | undefined;
    if (first) {
      const v = first["value"];
      if (typeof v === "number") return v;
    }
  }

  return null;
}

/**
 * Returns true when the error code matches a known insights permission denial.
 * Does NOT inspect error_description or error_message strings.
 */
function isPermissionErrorCode(code: unknown): boolean {
  return typeof code === "number" && INSIGHTS_PERMISSION_CODES.has(code);
}

// ─── Account insights ─────────────────────────────────────────────────────────

/**
 * Fetches a 28-day rolling account insights snapshot.
 *
 * Endpoint: graph.instagram.com/{ig-user-id}/insights
 * Request model:
 *   period=day
 *   metric_type=total_value
 *   since=<unix epoch>   (now − 28 days)
 *   until=<unix epoch>   (now)
 *
 * This is the only supported way to get a 28-day window total.
 * period=week / days_28 / lifetime do NOT produce the same result.
 *
 * Metrics requested: reach, views, profile_views, accounts_engaged,
 *                    total_interactions.
 *
 * A single invalid metric does not fail the whole call — missing metrics
 * are returned as null on the snapshot.
 *
 * NEVER logs the access_token or any URL segment containing the token.
 */
export async function fetchAccountInsights(
  igUserId: string,
  accessToken: string,
): Promise<AccountInsightsResult> {
  const until = Math.floor(Date.now() / 1000);
  const since = until - WINDOW_DAYS * 24 * 60 * 60;

  // Build URL without logging token-bearing form
  const url = new URL(`${INSTAGRAM_GRAPH}/${igUserId}/insights`);
  url.searchParams.set(
    "metric",
    "reach,views,profile_views,accounts_engaged,total_interactions",
  );
  url.searchParams.set("period", "day");
  url.searchParams.set("metric_type", "total_value");
  url.searchParams.set("since", String(since));
  url.searchParams.set("until", String(until));
  url.searchParams.set("access_token", accessToken);

  let res: Response;
  try {
    res = await fetch(url.toString());
  } catch {
    console.warn("[instagram-insights] network error fetching account insights");
    return { available: false, permissionState: "unknown", snapshot: null };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    console.warn("[instagram-insights] account insights: failed to parse JSON response");
    return { available: false, permissionState: "unknown", snapshot: null };
  }

  const parsed = body as Record<string, unknown>;

  // API-level error — check before HTTP status (error may arrive with 200)
  if (parsed["error"]) {
    const err = parsed["error"] as Record<string, unknown>;
    const code = err["code"];
    if (isPermissionErrorCode(code)) {
      console.warn(
        "[instagram-insights] account insights: permission not granted (error code:",
        code,
        ")",
      );
      return { available: false, permissionState: "missing", snapshot: null };
    }
    // Other API error — do not expose raw description
    console.warn("[instagram-insights] account insights: API error code:", code);
    return { available: false, permissionState: "unknown", snapshot: null };
  }

  if (!res.ok) {
    console.warn("[instagram-insights] account insights: HTTP", res.status);
    return { available: false, permissionState: "unknown", snapshot: null };
  }

  const data = parsed["data"];
  if (!Array.isArray(data)) {
    console.warn("[instagram-insights] account insights: unexpected response shape");
    return { available: false, permissionState: "unknown", snapshot: null };
  }

  // Empty data array = permission may be granted but account has insufficient data.
  // MUST NOT become numeric zero.
  if (data.length === 0) {
    console.warn("[instagram-insights] account insights: empty data array (not enough data)");
    return { available: true, permissionState: "granted", snapshot: null };
  }

  const snapshot: AccountInsightsSnapshot = {
    windowDays: 28,
    since,
    until,
    fetchedAt: new Date().toISOString(),
    reach: extractTotalValue(data, "reach"),
    views: extractTotalValue(data, "views"),
    profileViews: extractTotalValue(data, "profile_views"),
    accountsEngaged: extractTotalValue(data, "accounts_engaged"),
    totalInteractions: extractTotalValue(data, "total_interactions"),
  };

  return { available: true, permissionState: "granted", snapshot };
}

// ─── Media insights ───────────────────────────────────────────────────────────

/**
 * Fetches lifetime media insights for a single Instagram media object.
 *
 * Endpoint: graph.instagram.com/{media-id}/insights
 * Metrics requested: views, reach, shares, saved, profile_visits
 *
 * IMPORTANT:
 *   • The correct metric name is `saved`, NOT `saves`.
 *   • Metrics unsupported by the media type (e.g., reels-only metrics)
 *     are returned as null, not error. The whole call may still succeed.
 *   • Reel-specific metrics (plays, video_plays) are intentionally NOT requested.
 *
 * NEVER logs the access_token or any URL segment containing the token.
 */
export async function fetchMediaInsights(
  mediaId: string,
  accessToken: string,
): Promise<MediaInsightsResult> {
  const url = new URL(`${INSTAGRAM_GRAPH}/${mediaId}/insights`);
  // `saved` is the confirmed correct metric name for saves on feed media.
  url.searchParams.set("metric", "views,reach,shares,saved,profile_visits");
  url.searchParams.set("access_token", accessToken);

  let res: Response;
  try {
    res = await fetch(url.toString());
  } catch {
    console.warn("[instagram-insights] network error fetching media insights for media:", mediaId);
    return { available: false, permissionState: "unknown", metrics: null };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    console.warn("[instagram-insights] media insights: failed to parse JSON for media:", mediaId);
    return { available: false, permissionState: "unknown", metrics: null };
  }

  const parsed = body as Record<string, unknown>;

  if (parsed["error"]) {
    const err = parsed["error"] as Record<string, unknown>;
    const code = err["code"];
    if (isPermissionErrorCode(code)) {
      console.warn(
        "[instagram-insights] media insights: permission not granted for media:",
        mediaId,
        "(error code:",
        code,
        ")",
      );
      return { available: false, permissionState: "missing", metrics: null };
    }
    console.warn(
      "[instagram-insights] media insights: API error code:",
      code,
      "for media:",
      mediaId,
    );
    return { available: false, permissionState: "unknown", metrics: null };
  }

  if (!res.ok) {
    console.warn(
      "[instagram-insights] media insights: HTTP",
      res.status,
      "for media:",
      mediaId,
    );
    return { available: false, permissionState: "unknown", metrics: null };
  }

  const data = parsed["data"];
  if (!Array.isArray(data)) {
    console.warn("[instagram-insights] media insights: unexpected response shape for media:", mediaId);
    return { available: false, permissionState: "unknown", metrics: null };
  }

  // Empty data = permission likely granted but no data (e.g. media too recent).
  // MUST NOT become numeric zero.
  if (data.length === 0) {
    console.warn("[instagram-insights] media insights: empty data for media:", mediaId);
    return { available: true, permissionState: "granted", metrics: null };
  }

  const metrics: MediaInsightsMetrics = {
    views: extractLifetimeValue(data, "views"),
    reach: extractLifetimeValue(data, "reach"),
    shares: extractLifetimeValue(data, "shares"),
    // "saved" is correct — never request "saves"
    saved: extractLifetimeValue(data, "saved"),
    profileVisits: extractLifetimeValue(data, "profile_visits"),
  };

  return { available: true, permissionState: "granted", metrics };
}

// ─── Raw JSON merge helper ────────────────────────────────────────────────────

/**
 * Merges Instagram identity metadata and insights into a single raw JSON object.
 *
 * MERGE RULES:
 *   • Existing identity fields (instagram_id, username, name, …) are overwritten
 *     with fresh values passed in `identityFields`.
 *   • Existing `insights` sub-object is preserved unless a new one is provided.
 *   • Within `insights`, existing sub-keys (account, media) are preserved unless
 *     a new value is provided.
 *
 * This guarantees that:
 *   • A profile reconnect does NOT erase raw.insights.
 *   • An insights sync does NOT erase raw identity metadata.
 */
export function mergeInstagramRaw(
  existing: Prisma.InputJsonObject,
  identityFields: {
    instagram_id: string;
    username: string | null;
    name: string | null;
    profile_picture_url: string | null;
    biography: string | null;
    account_type: string | null;
  },
  newAccountSnapshot?: AccountInsightsSnapshot | null,
  newMediaInsights?: Record<string, MediaInsightsMetrics> | null,
): Prisma.InputJsonObject {
  const existingInsights: Prisma.InputJsonObject =
    typeof existing["insights"] === "object" && existing["insights"] !== null
      ? (existing["insights"] as Prisma.InputJsonObject)
      : {};

  const existingMedia: Prisma.InputJsonObject =
    typeof existingInsights["media"] === "object" && existingInsights["media"] !== null
      ? (existingInsights["media"] as Prisma.InputJsonObject)
      : {};

  // Each MediaInsightsMetrics value contains only number | null fields, which
  // are structurally valid Prisma.InputJsonObject values.
  const mergedMedia: Prisma.InputJsonObject = {
    ...existingMedia,
    ...(newMediaInsights as Prisma.InputJsonObject | null | undefined ?? {}),
  };

  // AccountInsightsSnapshot fields are all string | number | null — valid JSON.
  // Two-step cast (via unknown) is required because TypeScript cannot verify
  // structural overlap between a named interface and a mapped index type.
  // No `any` is used — this is the standard TypeScript widening pattern.
  const mergedInsights: Prisma.InputJsonObject = {
    ...existingInsights,
    ...(newAccountSnapshot !== undefined
      ? { account: newAccountSnapshot as unknown as Prisma.InputJsonObject }
      : {}),
    ...(Object.keys(mergedMedia).length > 0 ? { media: mergedMedia } : {}),
  };

  return {
    ...existing,
    ...identityFields,
    ...(Object.keys(mergedInsights).length > 0 ? { insights: mergedInsights } : {}),
  };
}
