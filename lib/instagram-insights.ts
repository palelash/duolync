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
import "server-only";

import { Prisma } from "@/lib/generated/prisma";
import { INSTAGRAM_GRAPH, classifyInstagramGraphFailure } from "./instagram-auth";

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * Reflects the state of the instagram_business_manage_insights permission.
 *
 *   "granted"      — API responded successfully; insights data is available.
 *   "missing"      — API returned a permission-denial code (10 / 200).
 *   "auth_invalid" — API returned OAuth error 190. This is reauth-required,
 *                    not a missing insights permission.
 *   "unknown"      — Network error, unexpected status, or parse failure.
 */
export type InsightsPermissionState = "granted" | "missing" | "auth_invalid" | "unknown";

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
  /** Successful empty responses produce a dated snapshot of unavailable/null values. */
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
  fetchedAt?: string;
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
  /** Successful empty responses produce null metric values, preserving zero when supplied. */
  metrics: MediaInsightsMetrics | null;
}

// ─── Internal constants ───────────────────────────────────────────────────────

const WINDOW_DAYS = 28 as const;

/**
 * Maps a Graph error code onto the insights permission state.
 * Codes 10 and 200 are permission denials.
 * Code 190 is invalid OAuth — reauth, never "insights permission missing".
 * The raw error_description is never logged.
 */
function insightsErrorState(code: unknown): InsightsPermissionState {
  const kind = classifyInstagramGraphFailure({ errorCode: code });
  if (kind === "auth_invalid") return "auth_invalid";
  if (kind === "permission_denied") return "missing";
  return "unknown";
}

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
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }

  // Path 2: values[0].value
  const values = item["values"];
  if (Array.isArray(values) && values.length > 0) {
    const first = values[0] as Record<string, unknown> | undefined;
    if (first) {
      const v = first["value"];
      if (typeof v === "number" && Number.isFinite(v)) return v;
    }
  }

  return null;
}

// ─── Account insights ─────────────────────────────────────────────────────────

/** Current Meta references verified 2026-10-09:
 * /docs/instagram-platform/api-reference/instagram-user/insights/
 * /docs/instagram-platform/reference/instagram-media/insights/
 * Incompatible metric/breakdown combinations can fail the whole request.
 * Account profile_views is absent from the current supported metrics table.
 */
function validInsightItem(item: unknown, format: "account" | "media"): boolean {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;
  const metric = item as Record<string, unknown>;
  if (typeof metric.name !== "string" || metric.name.length === 0) return false;
  const validValue = (value: unknown) => typeof value === "number"
    && Number.isFinite(value) && value >= 0;
  const hasTotal = Object.prototype.hasOwnProperty.call(metric, "total_value");
  const hasValues = Object.prototype.hasOwnProperty.call(metric, "values");
  // An absent metric is unavailable. A present metric must carry the
  // documented numeric structure, never an undefined/null placeholder.
  if (format === "account" ? !hasTotal : !hasTotal && !hasValues) return false;
  if (hasTotal) {
    if (!metric.total_value || typeof metric.total_value !== "object" || Array.isArray(metric.total_value)) return false;
    if (!validValue((metric.total_value as Record<string, unknown>).value)) return false;
  }
  if (hasValues) {
    if (!Array.isArray(metric.values) || metric.values.length === 0) return false;
    if (!metric.values.every(value => value && typeof value === "object"
      && !Array.isArray(value) && validValue((value as Record<string, unknown>).value))) return false;
  }
  return true;
}

async function readInsights(url: URL, format: "account" | "media"): Promise<{ state: InsightsPermissionState; data: unknown[] | null }> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    const body: unknown = await res.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return { state: "unknown", data: null };
    const parsed = body as Record<string, unknown>;
    if (parsed.error) {
      const error = parsed.error as Record<string, unknown>;
      // Auth classification precedes HTTP status, including errors in HTTP 200.
      const state = insightsErrorState(error?.code);
      return { state: state === "auth_invalid" ? state : res.status === 429 || res.status >= 500 ? "unknown" : state, data: null };
    }
    if (!res.ok || !Array.isArray(parsed.data) || !parsed.data.every(item => validInsightItem(item, format))) return { state: "unknown", data: null };
    return { state: "granted", data: parsed.data };
  } catch {
    return { state: "unknown", data: null };
  }
}

export async function fetchAccountInsights(igUserId: string, accessToken: string): Promise<AccountInsightsResult> {
  const until = Math.floor(Date.now() / 1000);
  const since = until - WINDOW_DAYS * 24 * 60 * 60;
  const url = new URL(`${INSTAGRAM_GRAPH}/${igUserId}/insights`);
  url.searchParams.set("metric", "reach,views,accounts_engaged,total_interactions");
  url.searchParams.set("period", "day");
  url.searchParams.set("metric_type", "total_value");
  url.searchParams.set("since", String(since));
  url.searchParams.set("until", String(until));
  url.searchParams.set("access_token", accessToken);
  const result = await readInsights(url, "account");
  if (result.data === null) return { available: false, permissionState: result.state, snapshot: null };
  return { available: true, permissionState: "granted", snapshot: {
    windowDays: 28, since, until, fetchedAt: new Date().toISOString(),
    reach: extractTotalValue(result.data, "reach"), views: extractTotalValue(result.data, "views"),
    profileViews: null,
    accountsEngaged: extractTotalValue(result.data, "accounts_engaged"),
    totalInteractions: extractTotalValue(result.data, "total_interactions"),
  } };
}

/** Product type is authoritative; unknown types are unavailable without guessing. */
export function instagramMediaInsightMetrics(mediaType: string | null, productType: string | null): string[] {
  if (!["IMAGE", "VIDEO", "CAROUSEL_ALBUM"].includes(mediaType ?? "")) return [];
  if (productType === "FEED") return ["views", "reach", "shares", "saved", "profile_visits"];
  if (productType === "REELS") return ["views", "reach", "shares", "saved"];
  if (productType === "STORY") return ["views", "reach", "shares", "profile_visits"];
  return [];
}

export async function fetchMediaInsights(mediaId: string, accessToken: string, mediaType: string | null = null, productType: string | null = null): Promise<MediaInsightsResult> {
  const metrics = instagramMediaInsightMetrics(mediaType, productType);
  // No verified strategy means no request and no newly fetched metric payload.
  if (!metrics.length) return { available: false, permissionState: "granted", metrics: null };
  const url = new URL(`${INSTAGRAM_GRAPH}/${mediaId}/insights`);
  url.searchParams.set("metric", metrics.join(","));
  url.searchParams.set("access_token", accessToken);
  const result = await readInsights(url, "media");
  if (result.data === null) return { available: false, permissionState: result.state, metrics: null };
  const value = (name: string) => metrics.includes(name) ? extractLifetimeValue(result.data!, name) : null;
  return { available: true, permissionState: "granted", metrics: {
    views: value("views"), reach: value("reach"), shares: value("shares"),
    saved: value("saved"), profileVisits: value("profile_visits"),
  } };
}

// ─── Raw JSON merge helper ────────────────────────────────────────────────────

/**
 * Merges Instagram identity metadata and insights into a single raw JSON object.
 *
 * MERGE RULES:
 *   • Existing identity fields (instagram_id, username, name, …) are overwritten
 *     with fresh values passed in `identityFields`.
 *   • Existing `insights` sub-object is preserved unless a new one is provided.
 *   • Successful account/media snapshots replace old fields, including nulls.
 *   • Permission-denied account snapshots retain their original fetchedAt.
 *   • preserveMedia keeps denied/skipped snapshots while replacing successful ids.
 *
 * The caller supplies existing JSON only for the same official account.
 * Historical insights survive permission denial without acquiring new timestamps.
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
  options: { preserveMedia?: boolean } = {},
): Prisma.InputJsonObject {
  const existingInsights: Prisma.InputJsonObject =
    typeof existing["insights"] === "object" && existing["insights"] !== null
      ? (existing["insights"] as Prisma.InputJsonObject)
      : {};

  // AccountInsightsSnapshot fields are all string | number | null — valid JSON.
  // Two-step cast (via unknown) is required because TypeScript cannot verify
  // structural overlap between a named interface and a mapped index type.
  // No `any` is used — this is the standard TypeScript widening pattern.
  const mergedInsights: Prisma.InputJsonObject = {
    ...existingInsights,
    ...(newAccountSnapshot !== undefined
      ? { account: newAccountSnapshot as unknown as Prisma.InputJsonObject }
      : {}),
    ...(newMediaInsights !== undefined ? { media: {
      ...(options.preserveMedia && typeof existingInsights.media === "object" && existingInsights.media !== null
        ? existingInsights.media as Prisma.InputJsonObject : {}),
      ...newMediaInsights as unknown as Prisma.InputJsonObject,
    } } : {}),
  };

  return {
    ...existing,
    ...identityFields,
    ...(Object.keys(mergedInsights).length > 0 ? { insights: mergedInsights } : {}),
  };
}
