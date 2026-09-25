import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const currentSession = await auth.api.getSession({ headers: req.headers });
    if (!currentSession?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    if (id === currentSession.session.id) {
      return NextResponse.json(
        { error: "Cannot revoke your current session. Use Sign Out instead." },
        { status: 400 },
      );
    }

    const target = await db.session.findUnique({ where: { id } });

    if (!target) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (target.userId !== currentSession.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.session.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/sessions/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
