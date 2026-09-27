/**
 * Duolync Chrome Extension – Popup Script
 */

const API_BASE     = "http://localhost:3000";
const SAVE_URL     = `${API_BASE}/api/creators/save`;
const CHECK_URL    = `${API_BASE}/api/creators/save`; // GET with ?platform&handle

// ─── DOM refs ─────────────────────────────────────────────────────────────

const stateLoading     = document.getElementById("state-loading");
const stateUnsupported = document.getElementById("state-unsupported");
const stateFound       = document.getElementById("state-found");

const platformBadge    = document.getElementById("platform-badge");
const platformLabel    = document.getElementById("platform-label");

const creatorAvatar    = document.getElementById("creator-avatar");
const avatarPlaceholder= document.getElementById("avatar-placeholder");
const creatorName      = document.getElementById("creator-name");
const creatorHandle    = document.getElementById("creator-handle");

const statFollowers    = document.getElementById("stat-followers");
const statPosts        = document.getElementById("stat-posts");

const btnSave          = document.getElementById("btn-save");
const btnIcon          = document.getElementById("btn-icon");
const btnLabel         = document.getElementById("btn-label");
const savedAtHint      = document.getElementById("saved-at-hint");
const savedAtDate      = document.getElementById("saved-at-date");

// ─── Platform meta ────────────────────────────────────────────────────────

const PLATFORM_META = {
  instagram: { label: "Instagram", className: "instagram" },
  tiktok:    { label: "TikTok",    className: "tiktok"    },
  youtube:   { label: "YouTube",   className: "youtube"   },
  threads:   { label: "Threads",   className: "threads"   },
};

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Format integer to human-readable (1_200_000 → "1.2M"). */
function fmt(n) {
  if (n == null || !Number.isFinite(n)) return null;
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}M`;
  }
  if (n >= 1_000) {
    const v = n / 1_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}K`;
  }
  return n.toLocaleString();
}

/** Format an ISO date string to a short locale date, e.g. "Sep 27, 2026". */
function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch { return iso; }
}

function showState(name) {
  stateLoading.classList.add("hidden");
  stateUnsupported.classList.add("hidden");
  stateFound.classList.add("hidden");

  if (name === "loading")     stateLoading.classList.remove("hidden");
  if (name === "unsupported") stateUnsupported.classList.remove("hidden");
  if (name === "found")       stateFound.classList.remove("hidden");
}

// ─── Render creator card ──────────────────────────────────────────────────

function renderCreator(data) {
  const meta = PLATFORM_META[data.platform] ?? {
    label: data.platform ?? "Unknown",
    className: "unknown",
  };

  platformBadge.className   = `platform-badge ${meta.className}`;
  platformLabel.textContent = meta.label;
  creatorName.textContent   = data.name    ?? "Unknown";
  creatorHandle.textContent = data.handle  ?? "—";

  if (data.avatar) {
    creatorAvatar.src = data.avatar;
    creatorAvatar.classList.remove("hidden");
    avatarPlaceholder.classList.add("hidden");
    creatorAvatar.onerror = () => {
      creatorAvatar.classList.add("hidden");
      avatarPlaceholder.classList.remove("hidden");
    };
  } else {
    creatorAvatar.classList.add("hidden");
    avatarPlaceholder.classList.remove("hidden");
  }

  // Stats strip — always visible; show "—" when data is absent
  const fmtF = fmt(data.followersCount);
  statFollowers.textContent = fmtF ?? "—";
  statFollowers.className   = fmtF ? "stat-value" : "stat-value empty";

  const fmtP = fmt(data.postsCount);
  statPosts.textContent = fmtP ?? "—";
  statPosts.className   = fmtP ? "stat-value" : "stat-value empty";
}

// ─── Button states ────────────────────────────────────────────────────────

function setBtnState(state, customLabel) {
  btnSave.disabled  = false;
  btnSave.className = "btn-save";
  savedAtHint.classList.add("hidden");

  switch (state) {
    case "idle":
      btnIcon.textContent  = "＋";
      btnLabel.textContent = "Save to Duolync";
      break;

    case "loading":
      btnIcon.innerHTML    = '<div class="spinner"></div>';
      btnLabel.textContent = "Saving…";
      btnSave.disabled     = true;
      break;

    case "checking":
      btnIcon.innerHTML    = '<div class="spinner"></div>';
      btnLabel.textContent = "Checking…";
      btnSave.disabled     = true;
      break;

    case "success":
      btnSave.classList.add("success");
      btnIcon.textContent  = "✓";
      btnLabel.textContent = "Saved to CRM!";
      btnSave.disabled     = true;
      break;

    case "already-saved":
      btnSave.classList.add("already-saved");
      btnIcon.textContent  = "↻";
      btnLabel.textContent = "In CRM · Update stats";
      break;

    case "error":
      btnSave.classList.add("error");
      btnIcon.textContent  = "✕";
      btnLabel.textContent = customLabel ?? "Try again";
      break;
  }
}

// ─── "Already saved?" check ───────────────────────────────────────────────

async function checkAlreadySaved(platform, handle) {
  if (!platform || !handle) return { saved: false };
  try {
    const params = new URLSearchParams({
      platform,
      handle: handle.trim().toLowerCase(),
    });
    const res = await fetch(`${CHECK_URL}?${params}`, {
      method: "GET",
      credentials: "include",
    });
    if (!res.ok) return { saved: false };
    return await res.json();
  } catch {
    return { saved: false };
  }
}

// ─── Save creator to backend ──────────────────────────────────────────────

async function saveCreator(data) {
  setBtnState("loading");

  const payload = {
    platform:       data.platform,
    handle:         data.handle,
    name:           data.name,
    avatar:         data.avatar,
    sourceUrl:      data.sourceUrl,
    followersCount: data.followersCount ?? null,
    postsCount:     data.postsCount ?? null,
  };
  console.log("[Duolync] POST", SAVE_URL, payload);

  try {
    const res = await fetch(SAVE_URL, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));
    console.log("[Duolync] save response:", res.status, json);

    if (res.status === 401) {
      setBtnState("error", "Sign in to Duolync first");
      setTimeout(() => setBtnState("idle"), 3000);
      return;
    }
    if (res.status === 403) {
      setBtnState("error", "Brand account required");
      setTimeout(() => setBtnState("idle"), 3000);
      return;
    }
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);

    setBtnState("success");
  } catch (err) {
    console.error("[Duolync] save failed:", err);
    setBtnState("error");
    setTimeout(() => setBtnState("idle"), 2500);
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────

async function init() {
  showState("loading");

  let tab;
  try { [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); }
  catch { showState("unsupported"); return; }

  if (!tab?.id) { showState("unsupported"); return; }

  // Ensure content script is injected (handles first-run after install)
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
  } catch { /* already injected */ }

  // Ask content script for creator data
  // The content script may wait (MutationObserver) for async-rendered stats.
  let response;
  try {
    response = await chrome.tabs.sendMessage(tab.id, { type: "DUOLYNC_GET_CREATOR", timeoutMs: 5000 });
  } catch (err) {
    console.warn("[Duolync] content script unreachable:", err);
    showState("unsupported");
    return;
  }

  console.log("[Duolync] content script response:", response);
  if (!response?.success || !response.data) { showState("unsupported"); return; }

  const { sources, ...extracted } = response.data;
  console.log("[Duolync] stat sources:", sources);
  const creatorData = { ...extracted, sourceUrl: tab.url };

  // Render card immediately so the user sees content without waiting for the check
  renderCreator(creatorData);
  showState("found");
  setBtnState("checking");

  // In parallel, check if this creator is already in the CRM
  const { saved, savedAt } = await checkAlreadySaved(
    creatorData.platform,
    creatorData.handle
  );

  // Already-saved creators stay clickable so their stats can be re-synced
  // (the save endpoint upserts).
  if (saved) {
    setBtnState("already-saved");
    if (savedAt) {
      savedAtDate.textContent = fmtDate(savedAt);
      savedAtHint.classList.remove("hidden");
    }
  } else {
    setBtnState("idle");
  }
  btnSave.addEventListener("click", () => {
    if (!btnSave.disabled) saveCreator(creatorData);
  });
}

document.addEventListener("DOMContentLoaded", init);
