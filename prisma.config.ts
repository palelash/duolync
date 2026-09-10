import { defineConfig } from "prisma/config";
import { config } from "dotenv";

// Prisma 7's env() helper does not auto-load .env — do it explicitly
config();

export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
