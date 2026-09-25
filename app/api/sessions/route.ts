import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

function parseUserAgent(ua: string | null): {
  deviceType: "Desktop" | "Mobile" | "Tablet";
  os: string;
  browser: string;
} {
  if (!ua) return { deviceType: "Desktop", os: "Unknown", browser: "Unknown" };

  let deviceType: "Desktop" | "Mobile" | "Tablet" = "Desktop";
  let os = "Unknown";
  let browser = "Unknown";

  if (/iPad/i.test(ua)) deviceType = "Tablet";
  else if (/Mobile|Android.*Mobile|iPhone/i.test(ua)) deviceType = "Mobile";
  else if (/Android/i.test(ua)) deviceType = "Tablet";

  if (/Windows NT/i.test(ua)) os = "Windows";
  else if (/Mac OS X/i.test(ua) && !/iPhone|iPad/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone/i.test(ua)) os = "iOS";
  else if (/iPad/i.test(ua)) os = "iPadOS";
  else if (/Linux/i.test(ua)) os = "Linux";
  else if (/CrOS/i.test(ua)) os = "ChromeOS";

  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = "Opera";
  else if (/Chrome\/[0-9]/i.test(ua) && !/Chromium/i.test(ua)) browser = "Chrome";
  else if (/Firefox\/[0-9]/i.test(ua)) browser = "Firefox";
  else if (/Safari\/[0-9]/i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
  else if (/MSIE|Trident/i.test(ua)) browser = "Internet Explorer";

  return { deviceType, os, browser };
}

export async function GET(req: NextRequest) {
  try {
    const currentSession = await auth.api.getSession({ headers: req.headers });
    if (!currentSession?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessions = await db.session.findMany({
      where: { userId: currentSession.user.id },
      orderBy: { updatedAt: "desc" },
    });

    const result = sessions.map((s) => {
      const parsed = parseUserAgent(s.userAgent);
      return {
        id: s.id,
        isCurrent: s.id === currentSession.session.id,
        deviceType: parsed.deviceType,
        os: parsed.os,
        browser: parsed.browser,
        ipAddress: s.ipAddress ?? "Unknown",
        createdAt: s.createdAt.toISOString(),
        lastActiveAt: s.updatedAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
      };
    });

    // Current session first
    result.sort((a, b) => (a.isCurrent ? -1 : b.isCurrent ? 1 : 0));

    return NextResponse.json({ sessions: result });
  } catch (err) {
    console.error("[GET /api/sessions]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
