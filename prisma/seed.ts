/**
 * Prisma Seed Script
 *
 * Creates test brand and creator accounts so the Discover pages have real
 * DB data to display in development / staging.
 *
 * Run with:
 *   pnpm prisma db seed
 *
 * All test accounts use the password: Test1234!
 */

import { PrismaClient } from "../lib/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { hashPassword } from "better-auth/crypto";
import { config } from "dotenv";

// Load .env so DATABASE_URL is available when run standalone
config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
  max: 2,
});

const adapter = new PrismaPg(pool);
const db = new PrismaClient({ adapter });

const TEST_PASSWORD = "Test1234!";

// ─── Seed Brands ──────────────────────────────────────────────────────────────

const BRANDS = [
  {
    email: "novaskin@test.nexly.com",
    name: "NovaSkin Beauty",
    companyName: "NovaSkin",
    bio: "Science-backed skincare brand disrupting the $180B beauty industry with clean, effective formulations.",
    industry: "Beauty & Cosmetics",
    website: "https://novaskin.com",
    brandAccountType: "company" as const,
  },
  {
    email: "flexcore@test.nexly.com",
    name: "FlexCore Fitness",
    companyName: "FlexCore",
    bio: "Premium home gym equipment trusted by professional athletes. Running a year-long ambassador campaign.",
    industry: "Health & Fitness",
    website: "https://flexcore.io",
    brandAccountType: "company" as const,
  },
  {
    email: "luminary@test.nexly.com",
    name: "Luminary Tech",
    companyName: "Luminary",
    bio: "Next-gen productivity SaaS built for creators and indie hackers. Looking for tech-forward voices.",
    industry: "Technology / SaaS",
    website: "https://luminary.app",
    brandAccountType: "company" as const,
  },
  {
    email: "terroir@test.nexly.com",
    name: "Terroir Foods",
    companyName: "Terroir",
    bio: "Artisan food brand sourcing directly from small farms across 12 countries. Zero compromise on flavour.",
    industry: "Food & Beverage",
    website: "https://terroir.co",
    brandAccountType: "company" as const,
  },
  {
    email: "arclight@test.nexly.com",
    name: "Arclight Wear",
    companyName: "Arclight",
    bio: "Sustainable activewear made from ocean-recovered plastic. Partnering with creators vocal about environmental impact.",
    industry: "Fashion & Apparel",
    website: "https://arclightwear.com",
    brandAccountType: "company" as const,
  },
];

// ─── Seed Creators ────────────────────────────────────────────────────────────

const CREATORS = [
  {
    email: "sofia@test.nexly.com",
    name: "Sofia Reyes",
    bio: "Minimalist tech & lifestyle creator helping 180K followers live intentionally. Partnered with Apple, Notion, and Arc.",
    niche: "Tech, Lifestyle, Design",
    primaryPlatform: "instagram",
    location: "Los Angeles, CA",
    totalFollowers: 180_000,
    avgEngagementRate: 4.8,
  },
  {
    email: "marcus@test.nexly.com",
    name: "Marcus Chen",
    bio: "Full-time fitness creator on TikTok. 475K combined following building habits that stick. Partnered with Nike & Whoop.",
    niche: "Fitness, Health, Motivation",
    primaryPlatform: "tiktok",
    location: "New York, NY",
    totalFollowers: 475_000,
    avgEngagementRate: 6.2,
  },
  {
    email: "amara@test.nexly.com",
    name: "Amara Osei",
    bio: "Inclusive beauty & fashion creator celebrating all skin tones. Based in London, campaigning globally.",
    niche: "Beauty, Fashion, Lifestyle",
    primaryPlatform: "instagram",
    location: "London, UK",
    totalFollowers: 110_000,
    avgEngagementRate: 5.5,
  },
  {
    email: "jake@test.nexly.com",
    name: "Jake Morrison",
    bio: "Weekly YouTube deep-dives on hardware, indie games & dev tools. Trusted by 257K tech enthusiasts.",
    niche: "Gaming, Tech Reviews",
    primaryPlatform: "youtube",
    location: "Toronto, Canada",
    totalFollowers: 257_000,
    avgEngagementRate: 3.9,
  },
  {
    email: "priya@test.nexly.com",
    name: "Priya Mehta",
    bio: "Food & travel creator documenting culinary adventures across Southeast Asia. Hyper-engaged micro audience.",
    niche: "Food, Travel, Culture",
    primaryPlatform: "tiktok",
    location: "Singapore",
    totalFollowers: 98_000,
    avgEngagementRate: 7.1,
  },
  {
    email: "lena@test.nexly.com",
    name: "Lena Kovács",
    bio: "Sustainable fashion advocate & creative director. Showing that style and sustainability can co-exist.",
    niche: "Fashion, Sustainability, Lifestyle",
    primaryPlatform: "instagram",
    location: "Berlin, Germany",
    totalFollowers: 1_615_000,
    avgEngagementRate: 2.8,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function upsertBrand(brand: (typeof BRANDS)[number], hashedPassword: string) {
  const existing = await db.user.findUnique({ where: { email: brand.email } });
  if (existing) {
    console.log(`  ↩  brand already exists: ${brand.email}`);
    return;
  }

  const user = await db.user.create({
    data: {
      email: brand.email,
      name: brand.name,
      emailVerified: true,
      role: "BRAND",
      hasCompletedOnboarding: true,
    },
  });

  // Email/password credential record (mirrors what Better Auth creates)
  await db.account.create({
    data: {
      userId: user.id,
      accountId: user.email,
      providerId: "credential",
      password: hashedPassword,
    },
  });

  // Brand profile
  await db.brandProfile.create({
    data: {
      userId: user.id,
      companyName: brand.companyName,
      bio: brand.bio,
      industry: brand.industry,
      website: brand.website,
      brandAccountType: brand.brandAccountType,
    },
  });

  console.log(`  ✓  created brand: ${brand.email}`);
}

async function upsertCreator(creator: (typeof CREATORS)[number], hashedPassword: string) {
  const existing = await db.user.findUnique({ where: { email: creator.email } });
  if (existing) {
    console.log(`  ↩  creator already exists: ${creator.email}`);
    return;
  }

  const user = await db.user.create({
    data: {
      email: creator.email,
      name: creator.name,
      emailVerified: true,
      role: "CREATOR",
      hasCompletedOnboarding: true,
    },
  });

  await db.account.create({
    data: {
      userId: user.id,
      accountId: user.email,
      providerId: "credential",
      password: hashedPassword,
    },
  });

  await db.creatorProfile.create({
    data: {
      userId: user.id,
      bio: creator.bio,
      niche: creator.niche,
      primaryPlatform: creator.primaryPlatform,
      location: creator.location,
      totalFollowers: creator.totalFollowers,
      avgEngagementRate: creator.avgEngagementRate,
    },
  });

  console.log(`  ✓  created creator: ${creator.email}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Seeding database…\n");

  // Hash the shared test password once using Better Auth's own algorithm
  const hashedPassword = await hashPassword(TEST_PASSWORD);

  console.log("Brands:");
  for (const brand of BRANDS) {
    await upsertBrand(brand, hashedPassword);
  }

  console.log("\nCreators:");
  for (const creator of CREATORS) {
    await upsertCreator(creator, hashedPassword);
  }

  console.log("\n✅ Seed complete.");
  console.log(`\nAll test accounts use password: ${TEST_PASSWORD}`);
  console.log("Brand logins:   novaskin@test.nexly.com  flexcore@test.nexly.com  etc.");
  console.log("Creator logins: sofia@test.nexly.com     marcus@test.nexly.com    etc.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
    await pool.end();
  });
