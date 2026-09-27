"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Role } from "@/lib/generated/prisma";
import { headers } from "next/headers";

async function getBrandUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return null;
  if (session.user.role !== Role.BRAND) return null;
  return session.user.id;
}

/** Returns the total number of creators saved to the CRM by this brand. */
export async function getSavedCreatorsCountAction(): Promise<{ count: number }> {
  try {
    const userId = await getBrandUserId();
    if (!userId) return { count: 0 };

    const count = await db.creator.count({ where: { userId } });
    return { count };
  } catch {
    return { count: 0 };
  }
}
