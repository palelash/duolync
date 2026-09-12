import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface VerifiedBadgeProps {
  /** Whether to render the badge at all. Pass `creator.verified` directly. */
  show?: boolean;
  /** xs = 3.5 · sm = 4 · md = 5  (h/w in rem units) — default "xs" */
  size?: "xs" | "sm" | "md";
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<VerifiedBadgeProps["size"]>, string> = {
  xs: "h-3.5 w-3.5",
  sm: "h-4 w-4",
  md: "h-5 w-5",
};

/**
 * Violet verification checkmark — shown only for admin-approved creator profiles.
 * Matches the violet/primary design language used across Duolync.
 */
export function VerifiedBadge({ show, size = "xs", className }: VerifiedBadgeProps) {
  if (!show) return null;
  return (
    <BadgeCheck
      className={cn(
        SIZE_CLASS[size],
        "shrink-0 text-violet-500",
        className,
      )}
      aria-label="Verified creator"
    />
  );
}
