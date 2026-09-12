import { auth } from "@/lib/auth";
import { fromPrismaRole } from "@/lib/roles";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  type Session = Awaited<ReturnType<typeof auth.api.getSession>>;
  let session: Session = null;
  try {
    session = await auth.api.getSession({ headers: await headers() });
  } catch (err) {
    console.error("[DashboardPage] getSession failed:", err);
  }

  if (!session?.user) {
    redirect("/sign-in");
  }

  if (!session.user.hasCompletedOnboarding) {
    redirect("/onboarding");
  }

  const role = fromPrismaRole(session.user.role);

  // Admin users have no brand/creator profile — send them straight to the admin panel.
  // Without this check, fromPrismaRole("ADMIN") returns "admin" which falls into the
  // creator branch, redirecting to /creator/dashboard.  ProtectedRoute there would then
  // send the admin BACK to /creator/dashboard → infinite redirect loop.
  if (role === "admin") redirect("/admin");

  redirect(role === "brand" ? "/brand/dashboard" : "/creator/dashboard");
}
