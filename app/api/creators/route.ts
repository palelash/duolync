import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { SocialPlatform } from "@/lib/generated/prisma";

const VALID_PLATFORMS = new Set(Object.values(SocialPlatform));

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "BRAND") {
      return NextResponse.json(
        { error: "Only brand accounts can access the creator CRM." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const platformRaw = searchParams.get("platform")?.toUpperCase() ?? "";
    const platform =
      platformRaw && VALID_PLATFORMS.has(platformRaw as SocialPlatform)
        ? (platformRaw as SocialPlatform)
        : undefined;

    const creators = await db.creator.findMany({
      where: {
        userId: session.user.id,
        ...(platform ? { platform } : {}),
        ...(q
          ? {
              OR: [
                { handle: { contains: q, mode: "insensitive" } },
                { name: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ creators });
  } catch (err) {
    console.error("[GET /api/creators]", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
