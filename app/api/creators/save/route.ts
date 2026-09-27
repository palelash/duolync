import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { SocialPlatform } from "@/lib/generated/prisma";

// ─── GET /api/creators/save?platform=&handle= ─────────────────────────────────
// Lightweight "already saved?" check called by the Chrome extension popup.

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id || session.user.role !== "BRAND") {
      return NextResponse.json({ saved: false });
    }

    const { searchParams } = new URL(req.url);
    const platform = searchParams.get("platform") ?? "";
    const handle   = (searchParams.get("handle") ?? "").trim().toLowerCase();

    if (!platform || !handle) return NextResponse.json({ saved: false });

    const socialPlatform = parsePlatform(platform);
    if (!socialPlatform)   return NextResponse.json({ saved: false });

    const existing = await db.creator.findUnique({
      where: {
        userId_platform_handle: {
          userId: session.user.id,
          platform: socialPlatform,
          handle,
        },
      },
      select: { id: true, createdAt: true },
    });

    return NextResponse.json({
      saved: !!existing,
      ...(existing ? { savedAt: existing.createdAt.toISOString() } : {}),
    });
  } catch (err) {
    console.error("[GET /api/creators/save]", err);
    return NextResponse.json({ saved: false });
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface SaveCreatorBody {
  platform: string;
  handle: string;
  name?: string;
  avatar?: string;
  sourceUrl?: string;
  followersCount?: unknown;
  postsCount?: unknown;
  email?: string;
  notes?: string;
}

const MAX_INT4 = 2_147_483_647;

/** Accepts non-negative integers (or numeric strings); anything else → null. */
function toCount(raw: unknown): number | null {
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
  return Math.min(Math.round(n), MAX_INT4);
}

// ─── Platform mapping ─────────────────────────────────────────────────────────

const PLATFORM_MAP: Record<string, SocialPlatform> = {
  instagram: SocialPlatform.INSTAGRAM,
  tiktok: SocialPlatform.TIKTOK,
  youtube: SocialPlatform.YOUTUBE,
  threads: SocialPlatform.THREADS,
};

function parsePlatform(raw: string): SocialPlatform | null {
  return PLATFORM_MAP[raw.toLowerCase()] ?? null;
}

// ─── POST /api/creators/save ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const session = await auth.api.getSession({ headers: req.headers });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only brand accounts can save creators to the CRM
    if (session.user.role !== "BRAND") {
      return NextResponse.json(
        { error: "Only brand accounts can save creators." },
        { status: 403 }
      );
    }

    // ── Validate body ─────────────────────────────────────────────────────────
    let body: SaveCreatorBody;
    try {
      body = (await req.json()) as SaveCreatorBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const { platform, handle, name, avatar, sourceUrl, email, notes } = body;
    const followersCount = toCount(body.followersCount);
    const postsCount = toCount(body.postsCount);

    if (!platform || !handle) {
      return NextResponse.json(
        { error: "platform and handle are required." },
        { status: 400 }
      );
    }

    const socialPlatform = parsePlatform(platform);
    if (!socialPlatform) {
      return NextResponse.json(
        { error: `Unsupported platform "${platform}". Must be one of: instagram, tiktok, youtube, threads.` },
        { status: 400 }
      );
    }

    const normalizedHandle = handle.trim().toLowerCase();
    if (!normalizedHandle) {
      return NextResponse.json({ error: "handle cannot be empty." }, { status: 400 });
    }

    // ── Upsert ────────────────────────────────────────────────────────────────
    // Unique constraint: (userId, platform, handle) — one record per brand per creator.
    const creator = await db.creator.upsert({
      where: {
        userId_platform_handle: {
          userId: session.user.id,
          platform: socialPlatform,
          handle: normalizedHandle,
        },
      },
      update: {
        name: name ?? undefined,
        avatarUrl: avatar ?? undefined,
        sourceUrl: sourceUrl ?? undefined,
        followersCount: followersCount ?? undefined,
        postsCount: postsCount ?? undefined,
        email: email ?? undefined,
        notes: notes ?? undefined,
      },
      create: {
        userId: session.user.id,
        platform: socialPlatform,
        handle: normalizedHandle,
        name: name ?? null,
        avatarUrl: avatar ?? null,
        sourceUrl: sourceUrl ?? null,
        followersCount,
        postsCount,
        email: email ?? null,
        notes: notes ?? null,
      },
    });

    return NextResponse.json(
      {
        success: true,
        creator: {
          id: creator.id,
          platform: creator.platform,
          handle: creator.handle,
          name: creator.name,
          avatarUrl: creator.avatarUrl,
          sourceUrl: creator.sourceUrl,
          followersCount: creator.followersCount,
          postsCount: creator.postsCount,
          status: creator.status,
          createdAt: creator.createdAt.toISOString(),
          updatedAt: creator.updatedAt.toISOString(),
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[POST /api/creators/save]", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
