"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, Compass, Megaphone, MessageSquare, MoreHorizontal, X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMessaging } from "@/app/_components/messaging/MessagingContext";
import { getPendingApplicationsCountAction } from "@/app/actions/brand-applications";
import { getPendingInvitationsCountAction } from "@/app/actions/invitations";
import MobileNav from "@/app/_components/layout/MobileNav";
import { cn } from "@/lib/utils";

interface TabDef {
  key: string;
  icon: React.ElementType;
  label: string;
  path?: string;
  action?: "more";
}

const CREATOR_TABS: TabDef[] = [
  { key: "home",      icon: Home,           label: "Home",      path: "/creator/dashboard" },
  { key: "campaigns", icon: Megaphone,       label: "Campaigns", path: "/creator/campaigns" },
  { key: "discover",  icon: Compass,         label: "Discover",  path: "/creator/discover"  },
  { key: "messages",  icon: MessageSquare,   label: "Messages",  path: "/messages"          },
  { key: "more",      icon: MoreHorizontal,  label: "More",      action: "more"             },
];

const BRAND_TABS: TabDef[] = [
  { key: "home",      icon: Home,           label: "Home",      path: "/brand/dashboard"   },
  { key: "discover",  icon: Compass,         label: "Discover",  path: "/brand/discover"    },
  { key: "campaigns", icon: Megaphone,       label: "Campaigns", path: "/brand/campaigns"   },
  { key: "messages",  icon: MessageSquare,   label: "Messages",  path: "/messages"          },
  { key: "more",      icon: MoreHorizontal,  label: "More",      action: "more"             },
];

const BottomTabBar = () => {
  const { profile } = useAuth();
  const { unreadCount } = useMessaging();
  const pathname = usePathname();
  const isBrand = profile?.user_type === "brand";

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Close drawer when the user navigates to a new route
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (isBrand) {
      getPendingApplicationsCountAction()
        .then((res) => setPendingCount(res.count))
        .catch(() => {});
    } else {
      getPendingInvitationsCountAction()
        .then((res) => setPendingCount(res.count))
        .catch(() => {});
    }
  }, [isBrand]);

  const tabs = isBrand ? BRAND_TABS : CREATOR_TABS;
  const activeColor = isBrand ? "text-violet-500" : "text-violet-500";
  const activeBarColor = isBrand ? "bg-violet-500" : "bg-violet-500";

  function getBadge(key: string): number {
    if (key === "messages") return unreadCount;
    if (key === "campaigns") return pendingCount;
    return 0;
  }

  return (
    <>
      <MobileNav open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <nav
        className="fixed bottom-0 inset-x-0 z-40 lg:hidden bg-zinc-950/90 backdrop-blur-xl border-t border-white/[0.06]"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        aria-label="Main navigation"
      >
        <div className="flex h-16">
          {tabs.map((tab) => {
            const isActive = tab.action === "more"
              ? drawerOpen
              : !!(tab.path &&
                  (pathname === tab.path || pathname.startsWith(tab.path + "/")));

            const badge = getBadge(tab.key);
            const showBadge = badge > 0 && !isActive;
            const IconComp = tab.action === "more" && drawerOpen ? X : tab.icon;

            const itemClass = cn(
              "relative flex-1 flex flex-col items-center justify-center gap-[3px] transition-colors duration-150 select-none",
              isActive
                ? activeColor
                : "text-zinc-500 active:text-zinc-300",
            );

            const inner = (
              <>
                {/* Active bar at top */}
                {isActive && (
                  <span
                    className={cn(
                      "absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-full",
                      activeBarColor,
                    )}
                  />
                )}

                {/* Icon + badge */}
                <div className="relative mt-1">
                  <IconComp
                    className="w-[22px] h-[22px]"
                    strokeWidth={isActive ? 2 : 1.5}
                  />
                  {showBadge && (
                    <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] bg-red-500 rounded-full text-[8px] font-bold text-white flex items-center justify-center px-0.5 leading-none">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </div>

                {/* Label */}
                <span
                  className={cn(
                    "text-[10px] leading-none",
                    isActive ? "font-semibold" : "font-medium",
                  )}
                >
                  {tab.action === "more" && drawerOpen ? "Close" : tab.label}
                </span>
              </>
            );

            if (tab.action === "more") {
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setDrawerOpen((v) => !v)}
                  className={itemClass}
                  aria-label={drawerOpen ? "Close menu" : "More navigation options"}
                  aria-expanded={drawerOpen}
                >
                  {inner}
                </button>
              );
            }

            return (
              <Link key={tab.key} href={tab.path!} className={itemClass}>
                {inner}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
};

export default BottomTabBar;
