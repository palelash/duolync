"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Megaphone,
  ShieldCheck,
  AlertCircle,
  Scale,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

const navItems = [
  {
    label: "Dashboard",
    href: "/admin",
    icon: LayoutDashboard,
  },
  {
    label: "Users",
    href: "/admin/users",
    icon: Users,
  },
  {
    label: "Campaigns",
    href: "/admin/campaigns",
    icon: Megaphone,
  },
  {
    label: "Moderation",
    href: "/admin/moderation",
    icon: AlertCircle,
  },
  {
    label: "Disputes",
    href: "/admin/disputes",
    icon: Scale,
  },
] as const;

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.push("/");
  }

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-zinc-800 bg-zinc-950 text-zinc-100">
      {/* Logo / Brand */}
      <div className="flex items-center gap-2.5 border-b border-zinc-800 px-6 py-5">
        <ShieldCheck className="h-6 w-6 text-violet-400" />
        <span className="text-lg font-semibold tracking-tight">
          Duolync <span className="text-violet-400">Admin</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 p-4">
        {navItems.map(({ label, href, icon: Icon }) => {
          const active =
            href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-violet-600 text-white"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Sign-out */}
      <div className="border-t border-zinc-800 p-4">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-red-400"
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
