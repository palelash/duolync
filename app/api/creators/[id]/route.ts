import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "BRAND") {
      return NextResponse.json(
        { error: "Only brand accounts can delete creators." },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Verify ownership before deleting so a brand can't delete another brand's records.
    const existing = await db.creator.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Creator not found." }, { status: 404 });
    }

    if (existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    await db.creator.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/creators/[id]]", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
