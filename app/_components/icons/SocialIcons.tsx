"use client";
import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Official brand-accurate social platform icons.
 * Each icon is a self-contained square SVG with its own branded background
 * and the official symbol in white.  Size is controlled purely by className
 * (e.g. "w-6 h-6", "w-5 h-5", "w-8 h-8").
 */

// ─── Instagram ────────────────────────────────────────────────────────────────
// Official Instagram gradient: yellow → orange-red → magenta → blue-violet

export function InstagramIcon({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Instagram"
    >
      <defs>
        <radialGradient id={`ig-bg-${uid}`} cx="28%" cy="106%" r="148%">
          <stop offset="0%"  stopColor="#fdf497" />
          <stop offset="6%"  stopColor="#fdf497" />
          <stop offset="44%" stopColor="#fd5949" />
          <stop offset="62%" stopColor="#d6249f" />
          <stop offset="90%" stopColor="#285AEB" />
        </radialGradient>
      </defs>
      {/* Branded gradient background */}
      <rect width="24" height="24" rx="5.5" fill={`url(#ig-bg-${uid})`} />
      {/* Camera body outline */}
      <rect x="6.5" y="6.5" width="11" height="11" rx="3.2" stroke="white" strokeWidth="1.6" fill="none" />
      {/* Lens circle */}
      <circle cx="12" cy="12" r="3" stroke="white" strokeWidth="1.6" fill="none" />
      {/* Flash dot */}
      <circle cx="16.1" cy="7.9" r="0.95" fill="white" />
    </svg>
  );
}

// ─── TikTok ───────────────────────────────────────────────────────────────────
// Official TikTok: black bg, musical-note shape with cyan + red double-exposure

export function TikTokIcon({ className }: { className?: string }) {
  const path = "M13.8 3.6h-2.1V13a2.15 2.15 0 1 1-3-1.96V8.73a4.37 4.37 0 1 0 5.1 4.27V6.52a5.95 5.95 0 0 0 3.47 1.1V5.4a3.9 3.9 0 0 1-3.46-1.8z";
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="TikTok"
    >
      <rect width="24" height="24" rx="5.5" fill="#010101" />
      {/* Cyan shadow */}
      <path d={path} fill="#69C9D0" transform="translate(-0.5,0)" opacity="0.9" />
      {/* Red shadow */}
      <path d={path} fill="#EE1D52" transform="translate(0.5,0)" opacity="0.9" />
      {/* White foreground */}
      <path d={path} fill="white" />
    </svg>
  );
}

// ─── YouTube ──────────────────────────────────────────────────────────────────
// Official YouTube: red bg, white play shield, red triangle

export function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="YouTube"
    >
      <rect width="24" height="24" rx="5.5" fill="#FF0000" />
      {/* White play-button shield */}
      <path
        d="M19.8 8.26a2.08 2.08 0 0 0-1.46-1.47C17.06 6.5 12 6.5 12 6.5s-5.06 0-6.34.29A2.08 2.08 0 0 0 4.2 8.26C3.86 9.55 3.86 12 3.86 12s0 2.45.34 3.74a2.08 2.08 0 0 0 1.46 1.47C6.94 17.5 12 17.5 12 17.5s5.06 0 6.34-.29a2.08 2.08 0 0 0 1.46-1.47c.34-1.29.34-3.74.34-3.74s0-2.45-.34-3.74z"
        fill="white"
      />
      {/* Play triangle */}
      <polygon points="10.18,9.68 10.18,14.32 14.77,12" fill="#FF0000" />
    </svg>
  );
}

// ─── Facebook ─────────────────────────────────────────────────────────────────
// Official Facebook: #1877F2 blue bg, white "f" letterform

export function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Facebook"
    >
      <rect width="24" height="24" rx="5.5" fill="#1877F2" />
      {/* Official f letterform */}
      <path
        d="M15.5 8h-2c-.28 0-.5.22-.5.5V10h2.5l-.38 2.5H13V19h-2.5v-6.5H9V10h1.5V8.5C10.5 6.57 12.07 5 14 5h1.5v3z"
        fill="white"
      />
    </svg>
  );
}

// ─── Threads ──────────────────────────────────────────────────────────────────
// Official Threads: #101010 bg, white "@"-derived thread mark

export function ThreadsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Threads"
    >
      <rect width="24" height="24" rx="5.5" fill="#101010" />
      {/* Official Threads glyph */}
      <path
        d="M16.22 11.18a4.38 4.38 0 0 0-.4-.16c-.07-1.56-.95-2.46-2.44-2.47h-.05c-.89 0-1.64.38-2.09 1.06l.99.68c.3-.45.77-.69 1.1-.69.75 0 1.21.47 1.39 1.41-.45-.07-.92-.09-1.41-.07-1.43.08-2.34.88-2.28 1.98.03.56.32 1.05.8 1.36.42.28.96.41 1.53.38.74-.05 1.39-.34 1.87-.84.36-.39.6-.9.69-1.51.33.2.55.45.64.76.18.59.01 1.33-.45 1.88-.52.6-1.38.9-2.49.9-1.19 0-2.08-.39-2.65-1.15-.54-.72-.82-1.78-.82-3.15 0-1.37.28-2.43.82-3.15.57-.77 1.46-1.16 2.65-1.16.85 0 1.56.2 2.1.6.46.34.82.83 1.06 1.45l1.19-.4a4.5 4.5 0 0 0-1.33-1.98c-.76-.63-1.78-.97-3.02-.97-1.6 0-2.89.56-3.73 1.63-.76.99-1.15 2.34-1.15 4.01 0 1.67.39 3.02 1.15 4.01.84 1.07 2.13 1.63 3.73 1.63 1.32 0 2.38-.38 3.07-1.1.72-.76 1.01-1.84.84-2.91a2.73 2.73 0 0 0-.48-1.1zm-3.8 1.71c-.62.04-1.28-.25-1.3-.84-.02-.44.39-.94 1.35-.99.47-.03.9.01 1.37.08-.1.95-.65 1.71-1.42 1.75z"
        fill="white"
      />
    </svg>
  );
}

// ─── X / Twitter ──────────────────────────────────────────────────────────────
// Official X (Twitter): #000 bg, white X letterform

export function XTwitterIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="X (Twitter)"
    >
      <rect width="24" height="24" rx="5.5" fill="#000000" />
      {/* Official X shape */}
      <path
        d="M17.75 3.5h2.851L14.098 10.1l7.653 10.4h-5.65l-4.078-5.39-4.665 5.39H4.507l6.951-8.025L3.746 3.5h5.79l3.687 4.9 4.527-4.9zM16.77 19h1.581L7.324 5.03H5.631L16.77 19z"
        fill="white"
      />
    </svg>
  );
}

// ─── Twitch ───────────────────────────────────────────────────────────────────
// Official Twitch: #9146FF purple bg, white glitch logo

export function TwitchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Twitch"
    >
      <rect width="24" height="24" rx="5.5" fill="#9146FF" />
      {/* Twitch glitch glyph */}
      <path
        d="M5.5 3.5L3.5 6v12h4.5v2.5l2.5-2.5h3.5l5-5V3.5H5.5zm8.5 12l-3 2.5H8v-2.5H4.5V5h11v10.5h-1.5zM14 9h-1.5v4H14V9zm-4 0H8.5v4H10V9z"
        fill="white"
      />
    </svg>
  );
}

// ─── LinkedIn ─────────────────────────────────────────────────────────────────
// Official LinkedIn: #0A66C2 blue bg, white "in" mark

export function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="LinkedIn"
    >
      <rect width="24" height="24" rx="5.5" fill="#0A66C2" />
      {/* LinkedIn in letterform */}
      <path
        d="M7.2 5.5a1.7 1.7 0 1 1-3.4 0 1.7 1.7 0 0 1 3.4 0zM4 8.5h3v9.5H4V8.5zm5.5 0H13v1.3c.6-1 1.7-1.5 3-1.5 2.2 0 3.5 1.5 3.5 4.2V18h-3v-5.2c0-1.5-.5-2.3-1.8-2.3-1.5 0-2.2.9-2.2 2.5V18h-3V8.5z"
        fill="white"
      />
    </svg>
  );
}

// ─── Platform icon registry ───────────────────────────────────────────────────

export type SocialPlatform =
  | "instagram"
  | "tiktok"
  | "youtube"
  | "facebook"
  | "facebook_page"
  | "threads"
  | "twitter"
  | "twitch"
  | "linkedin";

/** Map from platform key (lowercase) → brand icon component */
export const SOCIAL_ICONS: Record<string, React.FC<{ className?: string }>> = {
  instagram:    InstagramIcon,
  tiktok:       TikTokIcon,
  youtube:      YouTubeIcon,
  facebook:     FacebookIcon,
  facebook_page: FacebookIcon,
  threads:      ThreadsIcon,
  twitter:      XTwitterIcon,
  twitch:       TwitchIcon,
  linkedin:     LinkedInIcon,
};

/**
 * SocialBadge — renders the official brand icon for a given platform.
 * Falls back to a simple dark pill with the platform abbreviation if the
 * platform is not recognized.
 */
export function SocialBadge({
  platform,
  className,
}: {
  platform: string;
  className?: string;
}) {
  const Icon = SOCIAL_ICONS[platform.toLowerCase()];
  if (Icon) {
    return <Icon className={cn("shrink-0", className)} />;
  }
  // Unknown platform fallback
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md text-[10px] font-bold shrink-0 bg-neutral-700 text-white w-6 h-6",
        className,
      )}
    >
      {platform.slice(0, 2).toUpperCase()}
    </span>
  );
}
