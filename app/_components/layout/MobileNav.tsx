"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMessaging } from "@/app/_components/messaging/MessagingContext";
import { getPendingApplicationsCountAction } from "@/app/actions/brand-applications";
import { getPendingInvitationsCountAction } from "@/app/actions/invitations";
import { cn } from "@/lib/utils";
import { BRAND_NAV_ITEMS, CREATOR_NAV_ITEMS } from "./nav-config";

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
}

const MobileNav = ({ open, onClose }: MobileNavProps) => {
  const { profile } = useAuth();
  const { unreadCount } = useMessaging();
  const pathname = usePathname();
  const isBrand = profile?.user_type === "brand";
  const [pendingApplications, setPendingApplications] = useState(0);
  const [pendingInvitations, setPendingInvitations] = useState(0);

  useEffect(() => {
    if (isBrand) {
      getPendingApplicationsCountAction()
        .then((res) => setPendingApplications(res.count))
        .catch(() => setPendingApplications(0));
      return;
    }
    getPendingInvitationsCountAction()
      .then((res) => setPendingInvitations(res.count))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBrand]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const mainNavItems = isBrand ? BRAND_NAV_ITEMS : CREATOR_NAV_ITEMS;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={onClose}
            aria-hidden
          />

          {/* Drawer — slides in from the right */}
          <motion.div
            key="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="fixed inset-y-0 right-0 z-50 w-72 bg-zinc-950/95 backdrop-blur-xl border-l border-white/[0.07] flex flex-col lg:hidden shadow-2xl shadow-black/50"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 h-16 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-2xl overflow-hidden shrink-0 shadow-lg shadow-violet-500/20">
                  <img src="/duolync-logo.png" alt="Duolync" className="w-full h-full object-cover" />
                </div>
                <span
                  className="font-display font-bold text-lg tracking-tight"
                  style={{
                    background: "linear-gradient(135deg, #a78bfa 0%, #ec4899 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  Duolync
                </span>
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 flex items-center justify-center rounded-2xl text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors shrink-0"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" strokeWidth={1.5} />
              </button>
            </div>
            {/* Gradient separator under header */}
            <div className="shrink-0 h-px bg-white/[0.06] mx-0" />

            {/* Role badge */}
            {profile && (
              <div className="px-4 pt-3 pb-1">
                <span
                  className={cn(
                    "inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border tracking-wide",
                    isBrand
                      ? "bg-violet-500/10 text-violet-400 border-violet-500/15"
                      : "bg-violet-500/10 text-violet-400 border-violet-500/15",
                  )}
                >
                  {isBrand ? "Brand Account" : "Creator Account"}
                </span>
              </div>
            )}

            {/* Nav links */}
            <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
              {mainNavItems.map((item) => {
                const isActive = pathname === item.path || pathname.startsWith(item.path + "/");
                const isMessages = item.label === "Messages";
                const isCampaigns = item.label === "Campaigns" && isBrand;
                const isInvitations = item.label === "Invitations" && !isBrand;
                const hasUnreadMsg = isMessages && unreadCount > 0;
                const hasPendingApps = isCampaigns && pendingApplications > 0;
                const hasPendingInvites = isInvitations && pendingInvitations > 0;
                const hasBadge = hasUnreadMsg || hasPendingApps || hasPendingInvites;
                const badgeCount = isMessages ? unreadCount : isCampaigns ? pendingApplications : pendingInvitations;
                const activeClass = isBrand
                  ? "bg-gradient-to-r from-violet-500/20 to-pink-500/10 text-violet-300 border border-violet-500/20"
                  : "bg-gradient-to-r from-violet-500/20 to-pink-500/10 text-violet-300 border border-violet-500/20";
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 rounded-2xl transition-all text-sm",
                      isActive
                        ? activeClass
                        : [
                            "hover:text-zinc-100 hover:bg-white/[0.05] border border-transparent",
                            hasBadge ? "font-semibold text-zinc-200" : "font-medium text-zinc-400",
                          ],
                    )}
                  >
                    <item.icon className="w-4.5 h-4.5 shrink-0" strokeWidth={1.5} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {hasBadge && !isActive && (
                      <span className="min-w-[18px] h-[18px] bg-gradient-to-r from-red-500 to-rose-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center px-1 leading-none shrink-0">
                        {badgeCount > 9 ? "9+" : badgeCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* User info at bottom */}
            {profile && (
              <div
                className="px-4 pt-3 pb-4 shrink-0"
                style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
              >
                <div className="mb-3 h-px bg-white/[0.06]" />
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-2xl overflow-hidden ring-1 ring-white/10 shrink-0">
                    {profile.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full gradient-primary flex items-center justify-center text-white text-sm font-bold">
                        {(profile.full_name ?? "U")[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate leading-tight text-zinc-100">{profile.full_name}</p>
                    <p className="text-[11px] text-zinc-500 truncate mt-0.5 leading-tight">{profile.email}</p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default MobileNav;
