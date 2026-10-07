"use client";

import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import type { CreatorAnalyticsV2 } from "@/lib/analytics-v2";
import { AllPlatformsTab } from "./AllPlatformsTab";
import { InstagramAnalytics } from "./InstagramAnalytics";
import { TikTokAnalytics } from "./TikTokAnalytics";
import { YouTubeAnalytics } from "./YouTubeAnalytics";

interface AnalyticsTabsProps {
  analytics: CreatorAnalyticsV2;
}

/**
 * Top-level Analytics V2 tab orchestrator.
 *
 * Tabs:
 *   [ All Platforms ] always shown
 *   [ Instagram ]     when slice.showAsTab
 *   [ TikTok ]        when slice.showAsTab
 *   [ YouTube ]       when slice.showAsTab (meaningful data only)
 *
 * Facebook has no tab (only comparison row in All Platforms).
 * Threads has no tab and does not appear anywhere.
 *
 * All data is pre-loaded — no per-tab server requests.
 */
export function AnalyticsTabs({ analytics }: AnalyticsTabsProps) {
  const { slices } = analytics;

  const instagramSlice = slices.find(
    (s) => s.platform === "instagram" && s.showAsTab,
  );
  const tiktokSlice = slices.find(
    (s) => s.platform === "tiktok" && s.showAsTab,
  );
  const youtubeSlice = slices.find(
    (s) => s.platform === "youtube" && s.showAsTab,
  );

  return (
    <Tabs defaultValue="all" className="w-full">
      {/* Horizontally scrollable on small screens */}
      <div className="overflow-x-auto pb-1 -mb-1">
        <TabsList className="mb-0 inline-flex min-w-max">
          <TabsTrigger value="all">All Platforms</TabsTrigger>
          {instagramSlice && (
            <TabsTrigger value="instagram">Instagram</TabsTrigger>
          )}
          {tiktokSlice && <TabsTrigger value="tiktok">TikTok</TabsTrigger>}
          {youtubeSlice && <TabsTrigger value="youtube">YouTube</TabsTrigger>}
        </TabsList>
      </div>

      <TabsContent value="all" className="mt-4">
        <AllPlatformsTab analytics={analytics} />
      </TabsContent>

      {instagramSlice && (
        <TabsContent value="instagram" className="mt-4">
          <InstagramAnalytics slice={instagramSlice} />
        </TabsContent>
      )}

      {tiktokSlice && (
        <TabsContent value="tiktok" className="mt-4">
          <TikTokAnalytics slice={tiktokSlice} />
        </TabsContent>
      )}

      {youtubeSlice && (
        <TabsContent value="youtube" className="mt-4">
          <YouTubeAnalytics slice={youtubeSlice} />
        </TabsContent>
      )}
    </Tabs>
  );
}
