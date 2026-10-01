import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface ApprovedBadgeProps {
  /** Whether to render the badge at all. Pass `creator.isMarketplaceApproved` directly. */
  show?: boolean;
  /**
   * xs = icon 3.5 + text 10px
   * sm = icon 4   + text 11px
   * md = icon 4.5 + text 12px
   * Default: "xs"
   */
  size?: "xs" | "sm" | "md";
  className?: string;
}

const ICON_SIZE: Record<NonNullable<ApprovedBadgeProps["size"]>, string> = {
  xs: "h-3.5 w-3.5",
  sm: "h-4 w-4",
  md: "h-5 w-5",
};

const TEXT_SIZE: Record<NonNullable<ApprovedBadgeProps["size"]>, string> = {
  xs: "text-[10px]",
  sm: "text-[11px]",
  md: "text-xs",
};

/**
 * Marketplace-approved pill — shown only for admin-approved creator profiles
 * that have been registered or claimed by a real user.
 *
 * This label indicates approval for the Duolync marketplace only.
 * It does NOT represent identity verification, KYC, or social-platform verification.
 */
export function ApprovedBadge({ show, size = "xs", className }: ApprovedBadgeProps) {
  if (!show) return null;
  return (
    <span
      title="Approved for the Duolync marketplace"
      aria-label="Approved for the Duolync marketplace"
      className={cn(
        "inline-flex items-center gap-0.5 font-medium text-violet-500",
        TEXT_SIZE[size],
        className,
      )}
    >
      <BadgeCheck className={cn("shrink-0", ICON_SIZE[size])} />
      <span>Approved</span>
    </span>
  );
}
