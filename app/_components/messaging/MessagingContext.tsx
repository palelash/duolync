"use client";

/**
 * MessagingContext — Facebook-style floating chat window manager.
 *
 * Also owns unread-conversation tracking (localStorage timestamps) and
 * a list of recent conversations for the header dropdown.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  getConversationsAction,
  type ConversationSummary,
} from "@/app/actions/messages";

export interface ConversationRecipient {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  user_type: "brand" | "creator" | "admin";
}

export interface ChatWindowState {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  userType: "brand" | "creator" | "admin";
  minimized: boolean;
}

interface MessagingContextValue {
  chatWindows: ChatWindowState[];
  openChatWindow: (recipient: ConversationRecipient) => void;
  closeChatWindow: (userId: string) => void;
  toggleMinimize: (userId: string) => void;
  /** Count of conversations with an unread last message. */
  unreadCount: number;
  /** Up to 8 most-recent conversations, used by the header dropdown. */
  recentConversations: ConversationSummary[];
  /** Mark all messages in this conversation as read. */
  markConversationRead: (partnerId: string) => void;
  /** Whether a specific conversation has unread messages. */
  isUnread: (partnerId: string) => boolean;
}

const MessagingContext = createContext<MessagingContextValue>({
  chatWindows: [],
  openChatWindow: () => {},
  closeChatWindow: () => {},
  toggleMinimize: () => {},
  unreadCount: 0,
  recentConversations: [],
  markConversationRead: () => {},
  isUnread: () => false,
});

const MAX_WINDOWS = 3;

// ─── localStorage helpers ─────────────────────────────────────────────────────

function lsReadKey(userId: string, partnerId: string) {
  return `duolync_msgread_${userId}_${partnerId}`;
}

function countUnread(conversations: ConversationSummary[], currentUserId: string): number {
  if (typeof window === "undefined") return 0;
  let n = 0;
  for (const conv of conversations) {
    if (
      conv.lastMessageSenderId !== null &&
      conv.lastMessageSenderId !== currentUserId
    ) {
      const lastRead = localStorage.getItem(lsReadKey(currentUserId, conv.otherUserId));
      if (!lastRead) {
        n++;
      } else if (new Date(lastRead).getTime() < new Date(conv.lastMessageAt).getTime()) {
        n++;
      }
    }
  }
  return n;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function MessagingProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [chatWindows, setChatWindows] = useState<ChatWindowState[]>([]);
  const [recentConversations, setRecentConversations] = useState<ConversationSummary[]>([]);
  // Bumping this triggers unread recomputation without touching recentConversations.
  const [readVersion, setReadVersion] = useState(0);

  // Derived: unread count, recomputed when conversations list OR read timestamps change.
  const unreadCount =
    profile?.id ? countUnread(recentConversations, profile.id) : 0;

  // Fetch conversations on mount (and every 30 s for badge freshness).
  useEffect(() => {
    if (!profile?.id) {
      setRecentConversations([]);
      return;
    }
    const fetch = () => {
      getConversationsAction()
        .then((convs) => setRecentConversations(convs.slice(0, 8)))
        .catch((err) => console.warn("[MessagingContext] fetch conversations failed:", err));
    };
    fetch();
    const id = setInterval(fetch, 30_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  // Suppress the lint warning: readVersion is intentionally a trigger dep.
  useEffect(() => { /* forces re-render to recompute unreadCount */ }, [readVersion]);

  const markConversationRead = useCallback(
    (partnerId: string) => {
      if (!profile?.id || typeof window === "undefined") return;
      localStorage.setItem(lsReadKey(profile.id, partnerId), new Date().toISOString());
      setReadVersion((v) => v + 1);
    },
    [profile?.id],
  );

  const isUnread = useCallback(
    (partnerId: string): boolean => {
      if (!profile?.id || typeof window === "undefined") return false;
      const conv = recentConversations.find((c) => c.otherUserId === partnerId);
      if (!conv || !conv.lastMessageSenderId || conv.lastMessageSenderId === profile.id)
        return false;
      const lastRead = localStorage.getItem(lsReadKey(profile.id, partnerId));
      if (!lastRead) return true;
      return new Date(lastRead).getTime() < new Date(conv.lastMessageAt).getTime();
    },
    [profile?.id, recentConversations],
  );

  const openChatWindow = useCallback(
    (recipient: ConversationRecipient) => {
      markConversationRead(recipient.id);
      setChatWindows((prev) => {
        if (prev.some((w) => w.userId === recipient.id)) {
          return prev.map((w) =>
            w.userId === recipient.id ? { ...w, minimized: false } : w,
          );
        }
        const next = prev.length >= MAX_WINDOWS ? prev.slice(1) : prev;
        return [
          ...next,
          {
            userId: recipient.id,
            userName: recipient.full_name ?? "User",
            avatarUrl: recipient.avatar_url,
            userType: recipient.user_type,
            minimized: false,
          },
        ];
      });
    },
    [markConversationRead],
  );

  const closeChatWindow = useCallback((userId: string) => {
    setChatWindows((prev) => prev.filter((w) => w.userId !== userId));
  }, []);

  const toggleMinimize = useCallback((userId: string) => {
    setChatWindows((prev) =>
      prev.map((w) => (w.userId === userId ? { ...w, minimized: !w.minimized } : w)),
    );
  }, []);

  return (
    <MessagingContext.Provider
      value={{
        chatWindows,
        openChatWindow,
        closeChatWindow,
        toggleMinimize,
        unreadCount,
        recentConversations,
        markConversationRead,
        isUnread,
      }}
    >
      {children}
    </MessagingContext.Provider>
  );
}

export function useMessaging() {
  return useContext(MessagingContext);
}
