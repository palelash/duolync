import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { AdminSidebar } from "./_components/AdminSidebar";

export const metadata = {
  title: "Admin — Duolync",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side double-check (middleware is the first gate).
  // Wrap in try/catch so a transient DB error redirects gracefully instead of
  // crashing the entire render with a white screen.
  let session: Awaited<ReturnType<typeof auth.api.getSession>>;
  try {
    session = await auth.api.getSession({ headers: await headers() });
  } catch {
    redirect("/");
  }

  if (!session?.user || !isAdmin(session.user.role)) {
    redirect("/");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-900 text-zinc-100">
      <AdminSidebar />

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950 px-8 py-4">
          <div />
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-400">
              Signed in as{" "}
              <span className="font-medium text-zinc-200">
                {session.user.email}
              </span>
            </span>
            <span className="rounded-full bg-violet-600/20 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-violet-400">
              Admin
            </span>
          </div>
        </header>

        {/* Scrollable page content */}
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}
