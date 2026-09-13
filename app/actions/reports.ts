"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  REPORT_REASON_LABELS,
  type ReportReasonValue,
} from "@/lib/report-constants";

export type SubmitReportInput = {
  reason: ReportReasonValue;
  description: string;
  /** User ID of the person being reported (optional) */
  targetUserId?: string;
  /** Campaign ID being reported (optional) */
  campaignId?: string;
};

export type SubmitReportResult =
  | { success: true; error: null }
  | { success: false; error: string };

export async function submitReport(
  input: SubmitReportInput,
): Promise<SubmitReportResult> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "You must be signed in to submit a report." };
    }

    const { reason, description, targetUserId, campaignId } = input;

    if (!description || description.trim().length < 10) {
      return { success: false, error: "Description must be at least 10 characters." };
    }
    if (description.trim().length > 2000) {
      return { success: false, error: "Description must be under 2000 characters." };
    }

    // Prevent self-reporting
    if (targetUserId && targetUserId === session.user.id) {
      return { success: false, error: "You cannot report yourself." };
    }

    await db.dispute.create({
      data: {
        reporterId: session.user.id,
        targetUserId: targetUserId ?? null,
        campaignId: campaignId ?? null,
        reason,
        description: description.trim(),
        status: "OPEN",
      },
    });

    // Notify admins via a system notification to every ADMIN user
    const admins = await db.user.findMany({
      where: { role: "ADMIN" },
      select: { id: true },
    });

    if (admins.length > 0) {
      await db.notification.createMany({
        data: admins.map((admin) => ({
          userId: admin.id,
          type: "SYSTEM",
          title: "New report submitted",
          body: `A user has submitted a report: ${REPORT_REASON_LABELS[reason]}`,
          link: "/admin/disputes",
        })),
      });
    }

    revalidatePath("/admin/disputes");
    return { success: true, error: null };
  } catch (err) {
    console.error("[submitReport]", err);
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "Failed to submit report. Please try again.",
    };
  }
}
