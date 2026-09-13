export const dynamic = 'force-dynamic';

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import DisputesClient from "./DisputesClient";

const userSelect = { id: true, name: true, email: true, image: true, role: true } as const;

async function getDisputes() {
  return db.dispute.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      campaign: { select: { id: true, title: true } },
      reporter: { select: userSelect },
      targetUser: { select: userSelect },
      brand: { select: userSelect },
      creator: { select: userSelect },
    },
  });
}

export default async function AdminDisputesPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || !isAdmin(session.user.role)) redirect("/");

  const disputes = await getDisputes();

  // Serialise Dates so the client component receives plain objects
  const serialised = disputes.map((d) => ({
    ...d,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }));

  return <DisputesClient initial={serialised} />;
}
