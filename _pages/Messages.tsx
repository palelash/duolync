"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  KeyboardEvent,
} from "react";
import {
  Send,
  Search,
  ArrowLeft,
  MessageSquare,
  BadgeCheck,
  Pencil,
  Loader2,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/app/_components/ui/button";
import { Input } from "@/app/_components/ui/input";
import MainLayout from "@/app/_components/layout/MainLayout";
import { useAuth } from "@/hooks/useAuth";
import { validateMessageContent } from "@/lib/validation";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  getConversationsAction,
  getConversationAction,
  sendMessageAction,
  searchUsersAction,
  getUserPreviewAction,
  type ConversationSummary,
  type DBMessage,
  type UserPreview,
} from "@/app/actions/messages";
import { useMessaging } from "@/app/_components/messaging/MessagingContext";

// ─── Skeleton ─────────────────────────────────────────────────────────────────

const ConversationSkeleton = () => (
  <div className="space-y-1 p-2">
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 px-3 py-3.5 rounded-xl animate-pulse">
        <div className="w-11 h-11 rounded-xl bg-zinc-200 dark:bg-zinc-800 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <div className="h-3.5 bg-zinc-200 dark:bg-zinc-800 rounded w-24" />
            <div className="h-2.5 bg-zinc-200 dark:bg-zinc-800 rounded w-10" />
          </div>
          <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-36" />
        </div>
      </div>
    ))}
  </div>
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0)
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/**
 * Returns only colour + shape classes for a message bubble.
 * max-width is applied on the WRAPPER div so the browser never
 * has to break characters in the middle of a word.
 */
function getBubbleClasses(
  senderRole: "brand" | "creator",
  isOwn: boolean,
): string {
  const base =
    "rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap";
  const tail = isOwn ? "rounded-br-md" : "rounded-bl-md";
  if (!isOwn) return cn(base, tail, "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100");
  if (senderRole === "brand") return cn(base, tail, "bg-teal-600 text-white");
  return cn(base, tail, "bg-purple-600 text-white");
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

const Avatar = ({
  name,
  avatarUrl,
  type,
  size = "md",
}: {
  name: string;
  avatarUrl: string | null;
  type: "brand" | "creator";
  size?: "sm" | "md" | "lg";
}) => {
  const sizeClass =
    size === "sm"
      ? "w-9 h-9 text-[11px]"
      : size === "lg"
        ? "w-14 h-14 text-lg"
        : "w-11 h-11 text-sm";
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={cn("rounded-xl overflow-hidden shrink-0", sizeClass)}>
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
      ) : (
        <div
          className={cn(
            "w-full h-full flex items-center justify-center font-bold text-white",
            type === "brand"
              ? "bg-gradient-to-br from-teal-600 to-cyan-600"
              : "bg-gradient-to-br from-violet-600 to-purple-600",
          )}
        >
          {initials}
        </div>
      )}
    </div>
  );
};

// ─── Conversation Row ─────────────────────────────────────────────────────────

const ConversationRow = ({
  conv,
  isSelected,
  unread,
  onClick,
}: {
  conv: ConversationSummary;
  isSelected: boolean;
  unread: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-left transition-all duration-150 overflow-hidden",
      isSelected
        ? "bg-primary/10 border border-primary/20"
        : unread
          ? "hover:bg-zinc-100 dark:hover:bg-neutral-800/60 border border-transparent bg-primary/5"
          : "hover:bg-zinc-100 dark:hover:bg-neutral-800/60 border border-transparent",
    )}
  >
    <Avatar
      name={conv.otherUserName}
      avatarUrl={conv.otherUserAvatarUrl}
      type={conv.otherUserType}
      size="md"
    />
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <span
          className={cn(
            "text-[13px] truncate min-w-0",
            unread ? "font-bold text-zinc-900 dark:text-zinc-50" : "font-semibold text-zinc-900 dark:text-zinc-50",
          )}
        >
          {conv.otherUserName}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {conv.lastMessageAt && (
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
              {formatTime(conv.lastMessageAt)}
            </span>
          )}
          {unread && !isSelected && (
            <span className="w-2 h-2 rounded-full bg-red-500" />
          )}
        </div>
      </div>
      <p
        className={cn(
          "text-xs truncate",
          unread ? "text-zinc-700 dark:text-zinc-50 font-medium" : "text-zinc-500 dark:text-zinc-400",
        )}
      >
        {conv.lastMessage ?? "No messages yet"}
      </p>
    </div>
  </button>
);

// ─── User Search Row (new conversation candidate) ─────────────────────────────

const UserSearchRow = ({
  user,
  isSelected,
  onClick,
}: {
  user: UserPreview;
  isSelected: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all duration-150 overflow-hidden",
      isSelected
        ? "bg-primary/10 border border-primary/20"
        : "hover:bg-zinc-100 dark:hover:bg-neutral-800/60 border border-transparent",
    )}
  >
    <Avatar
      name={user.name}
      avatarUrl={user.avatarUrl}
      type={user.userType}
      size="md"
    />
    <div className="flex-1 min-w-0">
      <p className="font-semibold text-[13px] truncate text-zinc-900 dark:text-zinc-50">{user.name}</p>
      <p
        className={cn(
          "text-[11px] font-medium capitalize",
          user.userType === "brand" ? "text-teal-600 dark:text-teal-400" : "text-violet-600 dark:text-violet-400",
        )}
      >
        {user.userType} · Start a conversation
      </p>
    </div>
  </button>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const Messages = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { markConversationRead, isUnread } = useMessaging();

  // ── Conversations list ─────────────────────────────────────────────────────
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [convsLoading, setConvsLoading] = useState(true);

  // ── Active conversation ────────────────────────────────────────────────────
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DBMessage[]>([]);
  const [msgsLoading, setMsgsLoading] = useState(false);

  // ── User search ────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserPreview[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Misc UI ────────────────────────────────────────────────────────────────
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [showMobileList, setShowMobileList] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Load conversations on mount ────────────────────────────────────────────
  useEffect(() => {
    setConvsLoading(true);
    getConversationsAction()
      .then(setConversations)
      .finally(() => setConvsLoading(false));
  }, []);

  // ── Handle ?userId= query param (deep-link into a specific conversation) ───
  //
  // FIX: async side-effects (getUserPreviewAction) must NOT be placed inside a
  // setState updater function — React may call updaters multiple times in
  // StrictMode and they must be pure.  Running the async call directly inside
  // the effect (after mount) prevents the "Cannot update Router while rendering
  // Messages" error.
  useEffect(() => {
    const userId = searchParams?.get("userId");
    if (!userId) return;

    setSelectedUserId(userId);
    setShowMobileList(false);

    // Inject a placeholder row only when this user is not already listed.
    // The async fetch runs outside any state-updater to stay pure.
    getUserPreviewAction(userId).then((preview) => {
      if (!preview) return;
      const placeholder: ConversationSummary = {
        otherUserId: preview.id,
        otherUserName: preview.name,
        otherUserAvatarUrl: preview.avatarUrl,
        otherUserType: preview.userType,
        lastMessage: null,
        lastMessageAt: new Date().toISOString(),
        lastMessageSenderId: null,
      };
      setConversations((p) =>
        p.some((c) => c.otherUserId === userId) ? p : [placeholder, ...p],
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ── Load messages when selected conversation changes ──────────────────────
  const loadMessages = useCallback(async (otherUserId: string) => {
    setMsgsLoading(true);
    try {
      const data = await getConversationAction(otherUserId);
      setMessages(data);
    } finally {
      setMsgsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedUserId) return;
    setMessages([]);
    loadMessages(selectedUserId);
    markConversationRead(selectedUserId);
  }, [selectedUserId, loadMessages, markConversationRead]);

  // ── Live polling for the active conversation (2500 ms) ────────────────────
  useEffect(() => {
    if (!selectedUserId) return;

    const id = setInterval(async () => {
      const refreshed = await getConversationAction(selectedUserId);
      setMessages((prev) => {
        if (refreshed.length === prev.length && refreshed.length > 0) {
          const lastNew = refreshed[refreshed.length - 1]?.id;
          const lastOld = prev[prev.length - 1]?.id;
          if (lastNew === lastOld) return prev; // no new messages
        }
        return refreshed;
      });
    }, 2500);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId]);

  // ── Scroll to bottom on new messages ─────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // ── Live user search (debounced 250 ms) ────────────────────────────────────
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchUsersAction(searchQuery);
        setSearchResults(results);
      } finally {
        setSearchLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ── Derived: metadata for the active conversation header ──────────────────
  const activeConvMeta: ConversationSummary | null =
    conversations.find((c) => c.otherUserId === selectedUserId) ?? null;

  // ── Start a conversation from a search result ─────────────────────────────
  const startConvFromSearch = (user: UserPreview) => {
    setSearchQuery("");
    setSearchResults([]);

    // Add a placeholder row to the conversations panel if not already there.
    setConversations((prev) => {
      if (prev.some((c) => c.otherUserId === user.id)) return prev;
      return [
        {
          otherUserId: user.id,
          otherUserName: user.name,
          otherUserAvatarUrl: user.avatarUrl,
          otherUserType: user.userType,
          lastMessage: null,
          lastMessageAt: new Date().toISOString(),
          lastMessageSenderId: null,
        },
        ...prev,
      ];
    });

    setSelectedUserId(user.id);
    setShowMobileList(false);
  };

  // ── Send message ───────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!selectedUserId || !inputText.trim() || sending) return;
    const validation = validateMessageContent(inputText);
    if (validation.success === false) {
      toast({
        title: "Validation error",
        description: validation.error,
        variant: "destructive",
      });
      return;
    }

    const text = validation.data;
    setSending(true);

    const optimistic: DBMessage = {
      id: `opt-${Date.now()}`,
      text,
      senderId: profile?.id ?? "",
      receiverId: selectedUserId,
      createdAt: new Date().toISOString(),
      senderRole: profile?.user_type ?? "creator",
      senderName: profile?.full_name ?? "Me",
      senderAvatarUrl: profile?.avatar_url ?? null,
    };
    setMessages((prev) => [...prev, optimistic]);
    setInputText("");

    const { error } = await sendMessageAction(selectedUserId, text);
    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInputText(text);
      toast({ title: "Send failed", description: error, variant: "destructive" });
    } else {
      const refreshed = await getConversationAction(selectedUserId);
      setMessages(refreshed);
      setConversations((prev) => {
        const exists = prev.find((c) => c.otherUserId === selectedUserId);
        const updated: ConversationSummary = exists
          ? {
              ...exists,
              lastMessage: text,
              lastMessageAt: new Date().toISOString(),
              lastMessageSenderId: profile?.id ?? null,
            }
          : {
              otherUserId: selectedUserId,
              otherUserName: activeConvMeta?.otherUserName ?? "User",
              otherUserAvatarUrl: activeConvMeta?.otherUserAvatarUrl ?? null,
              otherUserType: activeConvMeta?.otherUserType ?? "creator",
              lastMessage: text,
              lastMessageAt: new Date().toISOString(),
              lastMessageSenderId: profile?.id ?? null,
            };
        return exists
          ? prev.map((c) => (c.otherUserId === selectedUserId ? updated : c))
          : [updated, ...prev];
      });
    }
    setSending(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const selectConversation = (conv: ConversationSummary) => {
    setSelectedUserId(conv.otherUserId);
    setShowMobileList(false);
    setSearchQuery("");
    setSearchResults([]);
    markConversationRead(conv.otherUserId);
  };

  const isSearchMode = searchQuery.trim().length > 0;

  return (
    <MainLayout showGroupsPanel={false}>
      <div className="h-[calc(100dvh-8rem)] lg:h-[calc(100dvh-4rem)] flex bg-zinc-50 dark:bg-[#09090b]">

        {/* ── Left: Sidebar ────────────────────────────────────── */}
        <div
          className={cn(
            "w-full md:w-80 lg:w-96 border-r border-zinc-200 dark:border-zinc-800 flex flex-col bg-white dark:bg-zinc-950",
            !showMobileList && "hidden md:flex",
          )}
        >
          {/* Header */}
          <div className="px-3 pt-4 pb-3 sm:px-4 sm:pt-5 sm:pb-4 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-2 mb-4">
              {/* ── Back button ── */}
              <button
                onClick={() => router.back()}
                className="w-8 h-8 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 flex items-center justify-center text-zinc-500 dark:text-muted-foreground hover:text-zinc-900 dark:hover:text-foreground transition-colors shrink-0"
                title="Go back"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>

              <h2 className="font-display text-xl font-bold flex-1 text-zinc-900 dark:text-zinc-50">Messages</h2>

              {/* ── New message button — focuses search ── */}
              <button
                onClick={() => searchRef.current?.focus()}
                title="New message"
                className="w-8 h-8 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 flex items-center justify-center text-zinc-500 dark:text-muted-foreground hover:text-zinc-900 dark:hover:text-foreground transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Search bar — queries ALL platform users from DB */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 dark:text-muted-foreground pointer-events-none" />
              <Input
                ref={searchRef}
                placeholder="Search people or start a new chat…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-9 h-9 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:border-primary/50 text-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(""); setSearchResults([]); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
            <div className="p-2 space-y-1">
              {isSearchMode ? (
                /* ── Search Results Mode ── */
                searchLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                ) : searchResults.length > 0 ? (
                  <>
                    <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                      Platform Users
                    </p>
                    {searchResults.map((user) => (
                      <UserSearchRow
                        key={user.id}
                        user={user}
                        isSelected={user.id === selectedUserId}
                        onClick={() => startConvFromSearch(user)}
                      />
                    ))}
                  </>
                ) : (
                  <div className="flex flex-col items-center py-12 text-center px-4">
                    <p className="text-sm text-muted-foreground">
                      No users found for &ldquo;{searchQuery}&rdquo;
                    </p>
                  </div>
                )
              ) : convsLoading ? (
                /* ── Loading existing conversations ── */
                <ConversationSkeleton />
              ) : conversations.length > 0 ? (
                /* ── Existing conversations ── */
                conversations.map((conv) => (
                  <ConversationRow
                    key={conv.otherUserId}
                    conv={conv}
                    isSelected={conv.otherUserId === selectedUserId}
                    unread={isUnread(conv.otherUserId)}
                    onClick={() => selectConversation(conv)}
                  />
                ))
              ) : (
                /* ── Empty state ── */
                <div className="flex flex-col items-center py-16 px-6 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-zinc-50 dark:bg-neutral-900 border border-zinc-200 dark:border-neutral-800 flex items-center justify-center mb-4">
                    <MessageSquare className="w-5 h-5 text-zinc-400 dark:text-neutral-600" />
                  </div>
                  <p className="text-sm font-semibold mb-1 text-zinc-900 dark:text-zinc-50">No conversations yet</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Search for any user above, or click the pencil icon to start
                    a new chat.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: Chat Area ─────────────────────────────────── */}
        <div
          className={cn("flex-1 flex flex-col bg-zinc-50 dark:bg-[#09090b]", showMobileList && "hidden md:flex")}
        >
          {activeConvMeta ? (
            <>
              {/* Chat Header */}
              <div className="flex items-center gap-3 px-3 py-2.5 sm:px-5 sm:py-3.5 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shrink-0">
                <button
                  className="md:hidden text-zinc-500 dark:text-muted-foreground hover:text-zinc-900 dark:hover:text-foreground mr-1"
                  onClick={() => setShowMobileList(true)}
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <Avatar
                  name={activeConvMeta.otherUserName}
                  avatarUrl={activeConvMeta.otherUserAvatarUrl}
                  type={activeConvMeta.otherUserType}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-[14px] truncate text-zinc-900 dark:text-zinc-50">
                      {activeConvMeta.otherUserName}
                    </span>
                    <BadgeCheck className="w-3.5 h-3.5 text-primary shrink-0 opacity-60" />
                  </div>
                  <div
                    className={cn(
                      "text-[11px] font-semibold capitalize",
                      activeConvMeta.otherUserType === "brand"
                        ? "text-teal-600 dark:text-teal-400"
                        : "text-purple-600 dark:text-purple-400",
                    )}
                  >
                    {activeConvMeta.otherUserType} account
                  </div>
                </div>
              </div>

              {/* Messages — Messenger-style: content anchors to bottom */}
              <div className="flex-1 overflow-y-auto chat-scroll">
                <div className="flex flex-col justify-end min-h-full px-3 py-3 sm:px-5 sm:py-4">
                <div className="space-y-3 max-w-3xl mx-auto w-full">
                  {msgsLoading ? (
                    <div className="space-y-4 py-6 max-w-3xl mx-auto">
                      {[70, 50, 80, 45, 65].map((w, i) => (
                        <div key={i} className={`flex gap-2.5 animate-pulse ${i % 2 === 0 ? "flex-row-reverse" : ""}`}>
                          {i % 2 !== 0 && <div className="w-9 h-9 rounded-xl bg-zinc-200 dark:bg-zinc-800 shrink-0" />}
                          <div className={`h-10 rounded-2xl bg-zinc-200 dark:bg-zinc-800`} style={{ width: `${w}%` }} />
                        </div>
                      ))}
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center py-16 text-center">
                      <Avatar
                        name={activeConvMeta.otherUserName}
                        avatarUrl={activeConvMeta.otherUserAvatarUrl}
                        type={activeConvMeta.otherUserType}
                        size="lg"
                      />
                      <p className="mt-4 font-semibold text-[15px] text-zinc-900 dark:text-zinc-50">
                        {activeConvMeta.otherUserName}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                        You&apos;re now connected. Send a message to start the
                        conversation!
                      </p>
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const isOwn = msg.senderId === profile?.id;
                      return (
                        <div
                          key={msg.id}
                          className={cn(
                            "flex gap-2.5",
                            isOwn ? "flex-row-reverse" : "flex-row",
                          )}
                        >
                          {!isOwn && (
                            <Avatar
                              name={activeConvMeta.otherUserName}
                              avatarUrl={activeConvMeta.otherUserAvatarUrl}
                              type={activeConvMeta.otherUserType}
                              size="sm"
                            />
                          )}
                          {/* Wrapper owns max-width; bubble owns colour only */}
                          <div
                            className={cn(
                              "flex flex-col gap-0.5 min-w-0 max-w-[82%] sm:max-w-[70%]",
                              isOwn ? "items-end" : "items-start",
                            )}
                          >
                            <div
                              className={getBubbleClasses(msg.senderRole, isOwn)}
                              style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}
                            >
                              {msg.text}
                            </div>
                            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 px-1">
                              {formatTime(msg.createdAt)}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}

                  <div ref={messagesEndRef} />
                </div>
                </div>
              </div>

              {/* Input */}
              <div className="px-3 py-2.5 sm:px-5 sm:py-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shrink-0">
                <div className="flex gap-2 sm:gap-3 max-w-3xl mx-auto">
                  <Input
                    placeholder={`Message ${activeConvMeta.otherUserName}…`}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1 h-10 sm:h-11 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 focus-visible:ring-1 focus-visible:ring-purple-500 focus:border-purple-500 text-sm"
                    autoFocus
                    disabled={sending}
                  />
                  <Button
                    className={cn(
                      "h-10 sm:h-11 w-10 sm:w-auto px-0 sm:px-5 rounded-xl font-semibold gap-2 shrink-0 transition-all",
                      profile?.user_type === "brand"
                        ? "bg-teal-600 hover:bg-teal-500 text-white shadow-[0_4px_20px_rgba(20,184,166,0.35)]"
                        : "btn-gradient",
                    )}
                    onClick={handleSend}
                    disabled={!inputText.trim() || sending}
                  >
                    {sending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    <span className="hidden sm:inline">Send</span>
                  </Button>
                </div>
                <p className="hidden sm:block text-[10px] text-zinc-400 dark:text-zinc-500 text-center mt-2 max-w-3xl mx-auto">
                  Press{" "}
                  <kbd className="px-1 py-0.5 rounded bg-zinc-100 dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 text-[10px] font-mono text-zinc-600 dark:text-zinc-400">
                    Enter
                  </kbd>{" "}
                  to send
                </p>
              </div>
            </>
          ) : (
            /* ── No conversation selected ── */
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-0">
              {/* Illustration */}
              <div className="relative mb-6">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 border border-violet-200 dark:border-violet-500/20 flex items-center justify-center">
                  <MessageSquare className="w-9 h-9 text-violet-500" />
                </div>
                <span className="absolute -top-2 -right-2 w-6 h-6 bg-teal-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-lg">
                  +
                </span>
              </div>

              <h3 className="font-display text-xl font-bold mb-2 text-zinc-900 dark:text-zinc-50">
                Start a conversation
              </h3>
              <p className="text-muted-foreground text-sm max-w-xs leading-relaxed mb-5">
                Select a conversation from the left or{" "}
                <button
                  className="underline text-primary hover:text-primary/80 transition-colors font-medium"
                  onClick={() => searchRef.current?.focus()}
                >
                  search for a user
                </button>{" "}
                to send your first message.
              </p>

              <button
                onClick={() => searchRef.current?.focus()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-sm font-semibold transition-colors border border-primary/20"
              >
                <Pencil className="w-3.5 h-3.5" />
                New message
              </button>

              <div className="flex gap-3 mt-8">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400 border-teal-200 dark:border-teal-500/20">
                  <span className="w-2 h-2 rounded-full bg-teal-500" />
                  Brand
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400 border-purple-200 dark:border-purple-500/20">
                  <span className="w-2 h-2 rounded-full bg-purple-500" />
                  Creator
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default Messages;
