"use client";

import {
  useState,
  useEffect,
  useRef,
  KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Minus, X, Send, Loader2, Maximize2 } from "lucide-react";
import { ReportButton } from "@/app/_components/report/ReportModal";
import { cn } from "@/lib/utils";
import {
  getConversationAction,
  sendMessageAction,
  type DBMessage,
} from "@/app/actions/messages";
import { useAuth } from "@/hooks/useAuth";
import type { ChatWindowState } from "./MessagingContext";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Returns only the colour/shape classes for a bubble.
 * max-width is intentionally applied on the WRAPPER, not here, to prevent
 * the CSS engine from ever doing a mid-word break inside the bubble.
 */
function getBubbleColor(senderRole: "brand" | "creator" | "admin", isOwn: boolean): string {
  if (!isOwn) return "bg-zinc-200/90 dark:bg-neutral-800 text-zinc-800 dark:text-neutral-100 rounded-bl-sm";
  return senderRole === "brand"
    ? "bg-teal-600 text-white rounded-br-sm"
    : "bg-violet-600 text-white rounded-br-sm";
}

// ─── Mini Avatar ──────────────────────────────────────────────────────────────

function MiniAvatar({
  name,
  avatarUrl,
  type,
}: {
  name: string;
  avatarUrl: string | null;
  type: "brand" | "creator" | "admin";
}) {
  const initials = name
    .split(" ")
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0">
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
      ) : (
        <div
          className={cn(
            "w-full h-full flex items-center justify-center text-[10px] font-bold text-white",
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
}

// ─── Chat Window ──────────────────────────────────────────────────────────────

interface ChatWindowProps {
  window: ChatWindowState;
  onClose: (userId: string) => void;
  onMinimize: (userId: string) => void;
}

export default function ChatWindow({
  window: w,
  onClose,
  onMinimize,
}: ChatWindowProps) {
  const { profile } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<DBMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setMessages([]);
    getConversationAction(w.userId)
      .then(setMessages)
      .finally(() => setLoading(false));
  }, [w.userId]);

  // ── Live polling — 2500 ms when window is open ────────────────────────────
  useEffect(() => {
    if (w.minimized) return;
    const id = setInterval(async () => {
      const refreshed = await getConversationAction(w.userId);
      setMessages((prev) => {
        if (refreshed.length === prev.length && refreshed.length > 0) {
          const lastNew = refreshed[refreshed.length - 1]?.id;
          const lastOld = prev[prev.length - 1]?.id;
          if (lastNew === lastOld) return prev; // no change — skip re-render
        }
        return refreshed;
      });
    }, 2500);
    return () => clearInterval(id);
  }, [w.userId, w.minimized]);

  // ── Scroll to newest message ──────────────────────────────────────────────
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // ── Focus input on open / restore ────────────────────────────────────────
  useEffect(() => {
    if (!w.minimized) inputRef.current?.focus();
  }, [w.minimized]);

  // ── Send message ──────────────────────────────────────────────────────────
  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending) return;
    setSending(true);

    const optimistic: DBMessage = {
      id: `opt-${Date.now()}`,
      text,
      senderId: profile?.id ?? "",
      receiverId: w.userId,
      createdAt: new Date().toISOString(),
      senderRole: profile?.user_type ?? "creator",
      senderName: profile?.full_name ?? "Me",
      senderAvatarUrl: profile?.avatar_url ?? null,
    };

    setMessages((prev) => [...prev, optimistic]);
    setInputText("");

    const { error } = await sendMessageAction(w.userId, text);
    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInputText(text);
    } else {
      const refreshed = await getConversationAction(w.userId);
      setMessages(refreshed);
    }
    setSending(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Maximize: close widget + go to full chat page ─────────────────────────
  const handleMaximize = () => {
    onClose(w.userId);
    router.push(`/messages?userId=${w.userId}`);
  };

  const headerGradient =
    w.userType === "brand"
      ? "from-teal-800/95 to-cyan-800/95"
      : "from-violet-800/95 to-purple-800/95";

  return (
    <div
      className={cn(
        // Desktop widget
        "sm:w-[320px] sm:rounded-t-2xl",
        "border border-white/10 shadow-2xl shadow-black/50",
        "bg-neutral-950 flex flex-col",
        "[overflow:clip]",
        "transition-[height] duration-200 ease-in-out",
        w.minimized
          ? "h-12 w-[320px] rounded-t-2xl"
          : [
              "sm:h-[440px]",
              // Mobile full-screen overlay
              "max-sm:fixed max-sm:inset-0 max-sm:z-[99999] max-sm:h-full max-sm:w-full max-sm:rounded-none",
            ],
      )}
    >
      {/* ── Header ── */}
      <div
        className={cn(
          "flex items-center gap-2.5 px-3 h-12 shrink-0 cursor-pointer select-none",
          "bg-gradient-to-r",
          headerGradient,
        )}
        onClick={() => onMinimize(w.userId)}
      >
        <MiniAvatar name={w.userName} avatarUrl={w.avatarUrl} type={w.userType} />

        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-white truncate leading-tight">
            {w.userName}
          </p>
          <p
            className={cn(
              "text-[10px] font-medium capitalize",
              w.userType === "brand" ? "text-teal-300" : "text-violet-300",
            )}
          >
            {w.userType}
          </p>
        </div>

        {/* Report user */}
        <div onClick={(e) => e.stopPropagation()}>
          <ReportButton
            targetUser={{ id: w.userId, name: w.userName, type: w.userType }}
            variant="icon"
            className="!w-7 !h-7 !p-0 rounded-full text-white/60 hover:text-red-400 hover:!bg-red-500/20 hover:!border-transparent"
          />
        </div>

        {/* Maximize → full messages page */}
        <button
          onClick={(e) => { e.stopPropagation(); handleMaximize(); }}
          className="w-7 h-7 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          title="Open full chat"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); onMinimize(w.userId); }}
          className="w-7 h-7 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          title={w.minimized ? "Restore" : "Minimise"}
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); onClose(w.userId); }}
          className="w-7 h-7 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors sm:min-w-[28px] sm:min-h-[28px] max-sm:min-w-[36px] max-sm:min-h-[36px]"
          title="Close"
        >
          <X className="w-3.5 h-3.5 max-sm:w-4.5 max-sm:h-4.5" />
        </button>
      </div>

      {/* ── Body (hidden when minimized) ── */}
      {!w.minimized && (
        <>
          {/* Message stream — Messenger-style: content anchors to bottom */}
          <div className="flex-1 overflow-y-auto chat-scroll">
            {/* Inner wrapper: min-h-full + justify-end pins messages to bottom */}
            <div className="flex flex-col justify-end min-h-full px-3 py-3 gap-2">
              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-1 text-center px-4 py-6">
                  <MiniAvatar
                    name={w.userName}
                    avatarUrl={w.avatarUrl}
                    type={w.userType}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Say hi to{" "}
                    <span className="font-medium text-neutral-300">{w.userName}</span>!
                  </p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isOwn = msg.senderId === profile?.id;
                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex gap-1.5",
                        isOwn ? "justify-end" : "justify-start",
                      )}
                    >
                      {!isOwn && (
                        <MiniAvatar
                          name={w.userName}
                          avatarUrl={w.avatarUrl}
                          type={w.userType}
                        />
                      )}
                      {/* Wrapper controls max-width; bubble handles colour only */}
                      <div
                        className={cn(
                          "flex flex-col gap-0.5 min-w-0 max-w-[78%]",
                          isOwn ? "items-end" : "items-start",
                        )}
                      >
                        <div
                          className={cn(
                            "rounded-2xl px-3 py-2 text-[13px] leading-relaxed",
                            "whitespace-pre-wrap",
                            getBubbleColor(msg.senderRole, isOwn),
                          )}
                          style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}
                        >
                          {msg.text}
                        </div>
                        <span
                          className={cn(
                            "text-[9px] text-neutral-500 px-1",
                            isOwn ? "text-right" : "text-left",
                          )}
                        >
                          {formatTime(msg.createdAt)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={scrollRef} />
            </div>
          </div>

          {/* Input bar */}
          <div className="shrink-0 px-2.5 py-2.5 border-t border-neutral-800/80 flex gap-2 items-center bg-neutral-950">
            <input
              ref={inputRef}
              type="text"
              placeholder={`Message ${w.userName}…`}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              className="flex-1 h-8 bg-neutral-800/80 hover:bg-neutral-800 border border-neutral-700/60 rounded-full px-3.5 text-[13px] text-white placeholder:text-neutral-500 outline-none focus:border-primary/50 transition-colors max-sm:h-10 max-sm:text-base"
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || sending}
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all",
                "max-sm:w-10 max-sm:h-10",
                inputText.trim() && !sending
                  ? w.userType === "brand"
                    ? "bg-teal-600 hover:bg-teal-500 text-white"
                    : "bg-violet-600 hover:bg-violet-500 text-white"
                  : "bg-neutral-800 text-neutral-600 cursor-not-allowed",
              )}
              title="Send"
            >
              {sending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </>
      )}

    </div>
  );
}
