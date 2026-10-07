"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search, Home, Megaphone, Compass, MessageSquare, Heart,
  FileText, Mail, Radio, Settings, LogOut, Users, Sparkles,
  CornerDownLeft, X, Library,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

// ─── Item definitions ─────────────────────────────────────────────────────────

interface NavItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ElementType;
  group: string;
  path?: string;
  keywords?: string[];
  danger?: boolean;
}

const CREATOR_NAV: NavItem[] = [
  { id: "c-dashboard",   label: "Dashboard",        description: "Your command center",               icon: Home,           group: "Navigate", path: "/creator/dashboard",    keywords: ["home", "overview"] },
  { id: "c-campaigns",   label: "Browse Campaigns", description: "Find brand campaigns to apply to",  icon: Megaphone,      group: "Navigate", path: "/creator/campaigns",    keywords: ["jobs", "deals", "work"] },
  { id: "c-discover",    label: "Discover",          description: "Find brands and fellow creators",   icon: Compass,        group: "Navigate", path: "/creator/discover",     keywords: ["search", "brands", "network"] },
  { id: "c-content",     label: "Content",           description: "Manage and curate your content portfolio", icon: Library, group: "Navigate", path: "/creator/content",     keywords: ["portfolio", "featured", "hidden", "posts", "curation", "library"] },
  { id: "c-applications",label: "My Applications",  description: "Track all your campaign applications", icon: FileText,    group: "Navigate", path: "/creator/applications", keywords: ["applied", "status", "pending"] },
  { id: "c-invitations", label: "Invitations",       description: "Review brand collaboration invites", icon: Mail,          group: "Navigate", path: "/creator/invitations",  keywords: ["offers", "invited", "brand"] },
  { id: "c-social",      label: "Social Accounts",  description: "Connect and sync your platforms",   icon: Radio,          group: "Navigate", path: "/creator/presence",     keywords: ["instagram", "tiktok", "youtube", "platforms", "connect"] },
  { id: "c-saved",       label: "Saved Profiles",   description: "Your saved brands and creators",    icon: Heart,          group: "Navigate", path: "/creator/saved",        keywords: ["bookmarks", "favorites", "collections"] },
  { id: "c-messages",    label: "Messages",          description: "Chat with brands",                  icon: MessageSquare,  group: "Navigate", path: "/messages",             keywords: ["chat", "inbox", "dm"] },
  { id: "c-community",   label: "Community",         description: "Connect with other creators",       icon: Users,          group: "Navigate", path: "/community",            keywords: ["network", "groups"] },
  { id: "c-settings",    label: "Settings",          description: "Profile, notifications, preferences", icon: Settings,    group: "Account",  path: "/creator/settings",     keywords: ["profile", "edit", "account"] },
];

const BRAND_NAV: NavItem[] = [
  { id: "b-dashboard",   label: "Dashboard",         description: "Your campaign overview",            icon: Home,           group: "Navigate", path: "/brand/dashboard",     keywords: ["home", "overview"] },
  { id: "b-discover",    label: "Discover Creators", description: "Find the perfect influencers",      icon: Compass,        group: "Navigate", path: "/brand/discover",      keywords: ["search", "influencers", "creators"] },
  { id: "b-smart",       label: "Smart Match",       description: "AI-powered creator matching",       icon: Sparkles,       group: "Navigate", path: "/brand/smart-match",   keywords: ["ai", "match", "recommendations"] },
  { id: "b-campaigns",   label: "Campaigns",         description: "Manage your active campaigns",      icon: Megaphone,      group: "Navigate", path: "/brand/campaigns",     keywords: ["active", "manage", "create"] },
  { id: "b-proposals",   label: "Proposals",         description: "Review incoming creator applications", icon: FileText,   group: "Navigate", path: "/brand/proposals",     keywords: ["applications", "review", "pending"] },
  { id: "b-saved",       label: "Saved Profiles",    description: "Your saved creators and brands",    icon: Heart,          group: "Navigate", path: "/brand/saved",         keywords: ["bookmarks", "favorites", "collections"] },
  { id: "b-messages",    label: "Messages",          description: "Chat with creators",                icon: MessageSquare,  group: "Navigate", path: "/messages",            keywords: ["chat", "inbox", "dm"] },
  { id: "b-community",   label: "Community",         description: "Connect with your audience",        icon: Users,          group: "Navigate", path: "/community",           keywords: ["network", "groups"] },
  { id: "b-settings",    label: "Settings",          description: "Company profile and preferences",   icon: Settings,       group: "Account",  path: "/brand/settings",      keywords: ["profile", "edit", "account"] },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function CommandPalette() {
  const { profile, signOut } = useAuth();
  const router = useRouter();
  const isBrand = profile?.user_type === "brand";

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // ── Cmd+K + Escape + external open-command-palette event ──────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    const onCustom = () => setOpen(true);

    document.addEventListener("keydown", onKey);
    window.addEventListener("open-command-palette", onCustom);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-palette", onCustom);
    };
  }, []);

  // ── Focus input + reset state on open ─────────────────────────────────────
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // ── Build items list ───────────────────────────────────────────────────────
  const baseItems = useMemo<NavItem[]>(
    () => [
      ...(isBrand ? BRAND_NAV : CREATOR_NAV),
      {
        id: "sign-out",
        label: "Sign Out",
        description: "Sign out of your account",
        icon: LogOut,
        group: "Account",
        danger: true,
      },
    ],
    [isBrand],
  );

  // ── Filter ────────────────────────────────────────────────────────────────
  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return baseItems;
    return baseItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        item.keywords?.some((k) => k.includes(q)),
    );
  }, [query, baseItems]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIdx(0);
  }, [results]);

  // ── Scroll active item into view ───────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>("[data-selected='true']");
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx, open]);

  // ── Arrow + Enter keyboard nav ────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter" && results[selectedIdx]) {
        e.preventDefault();
        executeItem(results[selectedIdx]);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, results, selectedIdx]);

  const executeItem = useCallback(
    async (item: NavItem) => {
      close();
      if (item.id === "sign-out") {
        await signOut();
        router.push("/auth");
        return;
      }
      if (item.path) router.push(item.path);
    },
    [close, signOut, router],
  );

  // ── Grouped results for display ────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, NavItem[]>();
    for (const item of results) {
      if (!map.has(item.group)) map.set(item.group, []);
      map.get(item.group)!.push(item);
    }
    return [...map.entries()];
  }, [results]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="fixed inset-0 z-[9990] bg-black/45 backdrop-blur-[3px]"
            onClick={close}
            aria-hidden
          />

          {/* Panel */}
          <motion.div
            key="panel"
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="fixed top-[18%] left-1/2 -translate-x-1/2 z-[9991] w-full max-w-xl px-4"
            role="dialog"
            aria-modal
            aria-label="Command palette"
          >
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-700/50 shadow-2xl dark:shadow-black/70 overflow-hidden">

              {/* ── Search input ── */}
              <div className="flex items-center gap-3 px-4 h-14 border-b border-zinc-100 dark:border-zinc-800">
                <Search className="w-4 h-4 text-zinc-400 dark:text-zinc-500 shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search pages, actions…"
                  className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none"
                  aria-label="Search"
                  autoComplete="off"
                  spellCheck={false}
                />
                {query ? (
                  <button
                    onClick={() => setQuery("")}
                    className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-[10px] font-mono text-zinc-400 dark:text-zinc-500 shrink-0">
                    esc
                  </kbd>
                )}
              </div>

              {/* ── Results ── */}
              <div ref={listRef} className="max-h-80 overflow-y-auto overscroll-contain py-1.5">
                {results.length === 0 ? (
                  <div className="flex flex-col items-center py-10 text-center">
                    <Search className="w-7 h-7 text-zinc-200 dark:text-zinc-700 mb-2.5" />
                    <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                      No results for &ldquo;{query}&rdquo;
                    </p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                      Try a different search term
                    </p>
                  </div>
                ) : (
                  grouped.map(([group, items]) => (
                    <div key={group}>
                      <div className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                        {group}
                      </div>
                      {items.map((item) => {
                        const flatIdx = results.indexOf(item);
                        const isSelected = flatIdx === selectedIdx;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            data-selected={isSelected}
                            onClick={() => executeItem(item)}
                            onMouseEnter={() => setSelectedIdx(flatIdx)}
                            className={cn(
                              "w-full flex items-center gap-3 px-3 mx-1 py-2 rounded-xl text-left transition-colors",
                              isSelected
                                ? "bg-violet-50 dark:bg-violet-500/10"
                                : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
                            )}
                            style={{ width: "calc(100% - 8px)" }}
                          >
                            <div
                              className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                                isSelected
                                  ? "bg-violet-100 dark:bg-violet-500/20"
                                  : "bg-zinc-100 dark:bg-zinc-800",
                              )}
                            >
                              <item.icon
                                className={cn(
                                  "w-4 h-4 transition-colors",
                                  item.danger && !isSelected && "text-red-500",
                                  isSelected
                                    ? item.danger
                                      ? "text-red-500"
                                      : "text-violet-600 dark:text-violet-400"
                                    : "text-zinc-500 dark:text-zinc-400",
                                )}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div
                                className={cn(
                                  "text-sm font-medium truncate transition-colors",
                                  item.danger
                                    ? "text-red-600 dark:text-red-400"
                                    : isSelected
                                    ? "text-violet-700 dark:text-violet-200"
                                    : "text-zinc-800 dark:text-zinc-200",
                                )}
                              >
                                {item.label}
                              </div>
                              {item.description && (
                                <div className="text-xs text-zinc-400 dark:text-zinc-500 truncate">
                                  {item.description}
                                </div>
                              )}
                            </div>
                            {isSelected && (
                              <CornerDownLeft className="w-3.5 h-3.5 text-violet-400 dark:text-violet-500 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              {/* ── Footer hints ── */}
              <div className="flex items-center gap-4 px-4 py-2 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/60 dark:bg-zinc-900/60">
                {[
                  { key: "↑↓", hint: "navigate" },
                  { key: "↵", hint: "open" },
                  { key: "esc", hint: "close" },
                ].map(({ key, hint }) => (
                  <div key={key} className="flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
                    <kbd className="inline-flex items-center px-1 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[10px] font-mono">
                      {key}
                    </kbd>
                    <span>{hint}</span>
                  </div>
                ))}
                <div className="ml-auto text-[11px] text-zinc-300 dark:text-zinc-600 font-medium">
                  Duolync
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
