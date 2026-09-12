"use server";

import OpenAI from "openai";
import { db } from "@/lib/db";
import { Role } from "@/lib/generated/prisma";

// ─────────────────────────────────────────────────────────────────────────────
// 0. Lync — Global AI Chat Assistant
// ─────────────────────────────────────────────────────────────────────────────

export interface LyncMessage {
  role: "user" | "assistant";
  content: string;
}

export async function lyncChatAction(
  messages: LyncMessage[],
  context: { userType: "brand" | "creator" | "admin" | null; userName: string | null }
): Promise<{ reply: string | null; error: string | null }> {
  if (!process.env.OPENAI_API_KEY) {
    return { reply: null, error: "AI service not configured. Add OPENAI_API_KEY to your environment." };
  }

  const systemPrompt = `You are Lync, a smart AI assistant embedded inside Duolync — an influencer marketing platform connecting content creators with brands.

The user is a ${context.userType === "brand" ? "BRAND" : "CREATOR"}${context.userName ? ` named ${context.userName}` : ""}.

Your role:
${context.userType === "brand"
  ? `- Help with campaign strategy, creator discovery, ad format selection, ROI optimization, and brand-creator partnership advice.
- Guide them toward using features like AI Smart Match, campaign creation, and the Strategy Consultant.`
  : `- Help with content strategy, growth tips, optimal posting schedules, niche positioning, and brand deal negotiation.
- Guide them toward using features like the AI Growth Mentor, presence page, and campaign applications.`}

Tone: Friendly, concise, direct. Responses must be 1–4 sentences unless the user asks for a detailed breakdown. No bullet lists unless asked. No generic filler phrases.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      max_tokens: 300,
      temperature: 0.75,
    });
    const reply = response.choices[0]?.message?.content ?? null;
    return { reply, error: null };
  } catch (err) {
    console.error("[lyncChatAction]", err);
    return { reply: null, error: "Lync is temporarily unavailable. Try again in a moment." };
  }
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ─────────────────────────────────────────────────────────────────────────────
// Shared helper
// ─────────────────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toString();
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Creator AI Growth Tips
// ─────────────────────────────────────────────────────────────────────────────

export interface GrowthTip {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  category: "content" | "engagement" | "growth" | "monetization";
}

export interface PostingSlot {
  day: string;
  time: string;
  platform: string;
  reason: string;
}

export interface GrowthTipsResult {
  weeklyTips: GrowthTip[];
  postingSchedule: PostingSlot[];
  weeklyGoal: string;
}

export async function getCreatorGrowthTipsAction(stats: {
  followerCount: number;
  engagementRate: number;
  niche: string | null;
  platforms: string[];
}): Promise<{ data: GrowthTipsResult | null; error: string | null }> {
  if (!process.env.OPENAI_API_KEY) {
    return { data: null, error: "AI service not configured." };
  }

  const prompt = `You are an expert AI growth mentor for content creators. Given this creator's stats, provide highly personalized, actionable weekly growth advice.

Creator profile:
- Niche: ${stats.niche ?? "General content"}
- Followers: ${fmt(stats.followerCount)}
- Engagement rate: ${stats.engagementRate}%
- Active platforms: ${stats.platforms.length > 0 ? stats.platforms.join(", ") : "Not specified"}

Return a JSON object with exactly this structure (no extra text):
{
  "weeklyTips": [
    {"title": "Short title", "description": "1-2 sentence actionable tip", "priority": "high", "category": "content"},
    {"title": "Short title", "description": "1-2 sentence actionable tip", "priority": "medium", "category": "engagement"},
    {"title": "Short title", "description": "1-2 sentence actionable tip", "priority": "high", "category": "growth"},
    {"title": "Short title", "description": "1-2 sentence actionable tip", "priority": "low", "category": "monetization"}
  ],
  "postingSchedule": [
    {"day": "Monday", "time": "7:00 PM", "platform": "TikTok", "reason": "Peak engagement window"},
    {"day": "Wednesday", "time": "12:00 PM", "platform": "Instagram", "reason": "Midweek lunch scroll"},
    {"day": "Friday", "time": "6:00 PM", "platform": "YouTube", "reason": "Weekend prep traffic"},
    {"day": "Sunday", "time": "3:00 PM", "platform": "Instagram", "reason": "Weekend leisure peak"}
  ],
  "weeklyGoal": "One specific, measurable goal for this week based on their current stats"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 800,
      temperature: 0.7,
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return { data: null, error: "No response from AI." };

    const parsed = JSON.parse(raw) as GrowthTipsResult;
    return { data: parsed, error: null };
  } catch (err) {
    console.error("[getCreatorGrowthTipsAction]", err);
    return { data: null, error: "Failed to generate growth tips." };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Brand AI Ad Strategy Consultant
// ─────────────────────────────────────────────────────────────────────────────

export interface AdStrategy {
  format: string;
  description: string;
  roiMultiplier: number;
  platform: string;
  bestFor: string;
  confidenceScore: number;
}

export interface AdStrategyResult {
  strategies: AdStrategy[];
  summary: string;
}

export async function getBrandAdStrategyAction(
  prompt: string,
  context: { industry: string | null; budget: number }
): Promise<{ data: AdStrategyResult | null; error: string | null }> {
  if (!process.env.OPENAI_API_KEY) {
    return { data: null, error: "AI service not configured." };
  }

  const systemPrompt = `You are a senior brand advertising strategy consultant with deep expertise in influencer marketing. Analyze campaigns and recommend the most effective ad formats with data-backed ROI predictions.`;

  const userPrompt = `Brand campaign brief:
"${prompt}"

Context:
- Industry: ${context.industry ?? "Not specified"}
- Budget: $${context.budget.toLocaleString()}

Based on current platform trends and thousands of influencer campaigns, recommend the top 3 ad formats.

Return a JSON object with exactly this structure (no extra text):
{
  "strategies": [
    {
      "format": "Storytelling Reel (60s)",
      "description": "One sentence description of this format",
      "roiMultiplier": 3.2,
      "platform": "TikTok / Instagram",
      "bestFor": "What this format excels at",
      "confidenceScore": 91
    },
    {
      "format": "Unboxing / First Impression",
      "description": "One sentence description of this format",
      "roiMultiplier": 2.8,
      "platform": "YouTube / TikTok",
      "bestFor": "What this format excels at",
      "confidenceScore": 85
    },
    {
      "format": "Tutorial / How-to",
      "description": "One sentence description of this format",
      "roiMultiplier": 2.4,
      "platform": "YouTube / Instagram",
      "bestFor": "What this format excels at",
      "confidenceScore": 78
    }
  ],
  "summary": "2-3 sentence overall strategic recommendation tailored to this brand's goals"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      max_tokens: 700,
      temperature: 0.6,
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return { data: null, error: "No response from AI." };

    const parsed = JSON.parse(raw) as AdStrategyResult;
    return { data: parsed, error: null };
  } catch (err) {
    console.error("[getBrandAdStrategyAction]", err);
    return { data: null, error: "Failed to generate ad strategy." };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. AI Matchmaker & Smart Search
// ─────────────────────────────────────────────────────────────────────────────

export interface MatchedCreator {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  niche: string | null;
  totalFollowers: number;
  engagementRate: number;
  primaryPlatform: string | null;
  location: string | null;
  matchScore: number;
  audienceFit: number;
  salesPrediction: number;
  contentAuthenticity: number;
  matchReason: string;
}

interface AIMatchResult {
  id: string;
  matchScore: number;
  audienceFit: number;
  salesPrediction: number;
  contentAuthenticity: number;
  matchReason: string;
}

export async function runAIMatchmakerAction(query: string): Promise<{
  data: MatchedCreator[];
  error: string | null;
}> {
  if (!process.env.OPENAI_API_KEY) {
    return { data: [], error: "AI service not configured." };
  }

  // Fetch up to 30 creators from the database
  const users = await db.user.findMany({
    where: {
      role: Role.CREATOR,
      hasCompletedOnboarding: true,
      creatorProfile: { isNot: null },
    },
    select: {
      id: true,
      name: true,
      image: true,
      creatorProfile: {
        select: {
          niche: true,
          followerCount: true,
          totalFollowers: true,
          averageEngagement: true,
          avgEngagementRate: true,
          primaryPlatform: true,
          location: true,
          bio: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  if (users.length === 0) {
    return { data: [], error: "No creators found in the database yet." };
  }

  // Build compact creator list for the AI prompt
  const creatorList = users.map((u) => {
    const p = u.creatorProfile!;
    const followers = p.followerCount ?? p.totalFollowers ?? 0;
    const engagement = p.averageEngagement ?? p.avgEngagementRate ?? 0;
    return {
      id: u.id,
      name: u.name ?? "Creator",
      niche: p.niche ?? "General",
      followers,
      engagementRate: engagement,
      platform: p.primaryPlatform ?? "Unknown",
      location: p.location ?? "Unknown",
      bio: p.bio?.slice(0, 100) ?? "",
    };
  });

  const aiPrompt = `You are an AI influencer matchmaker. A brand has submitted the following query:

"${query}"

Here are the available creators:
${JSON.stringify(creatorList, null, 0)}

Analyze each creator and return the top 6 best matches ranked by overall match score.

Return a JSON object with exactly this structure (no extra text):
{
  "matches": [
    {
      "id": "creator_id_here",
      "matchScore": 95,
      "audienceFit": 92,
      "salesPrediction": 88,
      "contentAuthenticity": 96,
      "matchReason": "One specific sentence explaining why this creator is a great fit for the brand query"
    }
  ]
}

Scoring guidelines (0-100):
- matchScore: Overall match quality
- audienceFit: How well the creator's audience matches the brand's target demographic
- salesPrediction: Predicted sales/conversion potential based on niche & engagement
- contentAuthenticity: How authentic and credible the creator appears for this brand category`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: aiPrompt }],
      response_format: { type: "json_object" },
      max_tokens: 1000,
      temperature: 0.4,
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return { data: [], error: "No response from AI." };

    const parsed = JSON.parse(raw) as { matches: AIMatchResult[] };
    const aiMatches = parsed.matches ?? [];

    // Merge AI scores with DB creator data
    const userMap = new Map(users.map((u) => [u.id, u]));
    const results: MatchedCreator[] = aiMatches
      .map((m) => {
        const u = userMap.get(m.id);
        if (!u) return null;
        const p = u.creatorProfile!;
        return {
          id: u.id,
          fullName: u.name ?? "Creator",
          avatarUrl: u.image ?? null,
          niche: p.niche ?? null,
          totalFollowers: p.followerCount ?? p.totalFollowers ?? 0,
          engagementRate: p.averageEngagement ?? p.avgEngagementRate ?? 0,
          primaryPlatform: p.primaryPlatform ?? null,
          location: p.location ?? null,
          matchScore: m.matchScore,
          audienceFit: m.audienceFit,
          salesPrediction: m.salesPrediction,
          contentAuthenticity: m.contentAuthenticity,
          matchReason: m.matchReason,
        };
      })
      .filter((c): c is MatchedCreator => c !== null)
      .sort((a, b) => b.matchScore - a.matchScore);

    return { data: results, error: null };
  } catch (err) {
    console.error("[runAIMatchmakerAction]", err);
    return { data: [], error: "Failed to run AI matchmaker." };
  }
}
