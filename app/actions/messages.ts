"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Role } from "@/lib/generated/prisma";
import { fromPrismaRole } from "@/lib/roles";
import { headers } from "next/headers";

export interface ConversationSummary {
  otherUserId: string;
  otherUserName: string;
  otherUserAvatarUrl: string | null;
  otherUserType: "brand" | "creator" | "admin";
  lastMessage: string | null;
  lastMessageAt: string;
  /** senderId of the most-recent message — used by the client to detect unread threads. */
  lastMessageSenderId: string | null;
}

export interface DBMessage {
  id: string;
  text: string;
  senderId: string;
  receiverId: string;
  createdAt: string;
  senderRole: "brand" | "creator" | "admin";
  senderName: string;
  senderAvatarUrl: string | null;
}

async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");
  return session;
}

function displayNameForUser(user: {
  name: string | null;
  role: Role;
  brandProfile: { companyName: string } | null;
}): string {
  if (user.role === Role.BRAND && user.brandProfile?.companyName) {
    return user.brandProfile.companyName;
  }
  return user.name ?? "User";
}

const userPreviewSelect = {
  id: true,
  name: true,
  image: true,
  role: true,
  brandProfile: { select: { companyName: true } },
} as const;

export async function sendMessageAction(
  receiverId: string,
  text: string,
): Promise<{ error: string | null }> {
  const trimmed = text.trim();
  if (!trimmed) return { error: "Message cannot be empty" };
  if (trimmed.length > 5000) return { error: "Message too long (max 5000 characters)." };

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return { error: "Unauthorized" };

    const senderId = session.user.id;

    // Rate limit: max 30 messages per minute per sender
    const { rateLimit } = await import("@/lib/rate-limit");
    const allowed = await rateLimit(`${senderId}:send-message`, 30, 60_000);
    if (!allowed) return { error: "You're sending messages too quickly. Please wait a moment." };

    await db.message.create({
      data: { senderId, receiverId, text: trimmed },
    });

    return { error: null };
  } catch (err) {
    console.error("[sendMessageAction]:", err);
    return { error: "Failed to send message" };
  }
}

export async function getConversationsAction(): Promise<ConversationSummary[]> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return [];

    const currentUserId = session.user.id;

    const messages = await db.message.findMany({
      where: {
        OR: [{ senderId: currentUserId }, { receiverId: currentUserId }],
      },
      include: {
        sender: { select: userPreviewSelect },
        receiver: { select: userPreviewSelect },
      },
      orderBy: { createdAt: "desc" },
    });

    const seen = new Set<string>();
    const conversations: ConversationSummary[] = [];

    for (const msg of messages) {
      const other =
        msg.senderId === currentUserId ? msg.receiver : msg.sender;
      if (seen.has(other.id)) continue;
      seen.add(other.id);

      conversations.push({
        otherUserId: other.id,
        otherUserName: displayNameForUser(other),
        otherUserAvatarUrl: other.image ?? null,
        otherUserType: fromPrismaRole(other.role),
        lastMessage: msg.text,
        lastMessageAt: msg.createdAt.toISOString(),
        lastMessageSenderId: msg.senderId,
      });
    }

    return conversations;
  } catch (err) {
    console.error("[getConversationsAction]:", err);
    return [];
  }
}

// ─── User search / preview ────────────────────────────────────────────────────

export interface UserPreview {
  id: string;
  name: string;
  avatarUrl: string | null;
  userType: "brand" | "creator" | "admin";
}

export async function searchUsersAction(query: string): Promise<UserPreview[]> {
  if (query.trim().length < 2) return [];

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return [];

    const q = query.trim();

    const users = await db.user.findMany({
      where: {
        hasCompletedOnboarding: true,
        id: { not: session.user.id },
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          {
            brandProfile: {
              companyName: { contains: q, mode: "insensitive" },
            },
          },
        ],
      },
      select: userPreviewSelect,
      take: 8,
    });

    return users.map((u) => ({
      id: u.id,
      name: displayNameForUser(u),
      avatarUrl: u.image ?? null,
      userType: fromPrismaRole(u.role),
    }));
  } catch (err) {
    console.error("[searchUsersAction]:", err);
    return [];
  }
}

export async function getUserPreviewAction(
  userId: string,
): Promise<UserPreview | null> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return null;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: userPreviewSelect,
    });

    if (!user) return null;

    return {
      id: user.id,
      name: displayNameForUser(user),
      avatarUrl: user.image ?? null,
      userType: fromPrismaRole(user.role),
    };
  } catch (err) {
    console.error("[getUserPreviewAction]:", err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export async function getConversationAction(
  otherUserId: string,
): Promise<DBMessage[]> {
  try {
    const session = await requireSession();
    const currentUserId = session.user.id;

    const messages = await db.message.findMany({
      where: {
        OR: [
          { senderId: currentUserId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: currentUserId },
        ],
      },
      include: {
        sender: { select: userPreviewSelect },
      },
      orderBy: { createdAt: "asc" },
    });

    return messages.map((m) => ({
      id: m.id,
      text: m.text,
      senderId: m.senderId,
      receiverId: m.receiverId,
      createdAt: m.createdAt.toISOString(),
      senderRole: fromPrismaRole(m.sender.role),
      senderName: displayNameForUser(m.sender),
      senderAvatarUrl: m.sender.image ?? null,
    }));
  } catch (err) {
    console.error("[getConversationAction]:", err);
    return [];
  }
}
