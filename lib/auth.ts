import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "@/lib/db";
import { toPrismaRole } from "@/lib/roles";
import { sendVerificationEmail } from "@/lib/email";

export const auth = betterAuth({
  database: prismaAdapter(db, {
    provider: "postgresql",
  }),

  // With DB, Better Auth defaults to storing OAuth PKCE/state in Verification rows.
  // That often breaks in Next dev (localhost vs 127.0.0.1 cookies, prefetch/double-hit,
  // or cleanup/read timing). Cookie strategy encrypts state in cookies instead — same pattern
  // Better Auth uses for DB-less setups.
  account: {
    storeStateStrategy: "cookie",
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },

  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail({
        to: user.email,
        name: user.name ?? user.email,
        verificationUrl: url,
      });
    },
    // After clicking the link the user is signed in and sent here
    callbackURL: "/email-verified",
    autoSignInAfterVerification: true,
    // Always send on sign-up (default true)
    sendOnSignUp: true,
  },

  user: {
    additionalFields: {
      // Not client-settable: role is assigned during onboarding via selectRole(),
      // which runs server-side against the authenticated user.
      role: {
        type: "string" as const,
        required: false,
        // Must be an exact PostgreSQL enum value (case-sensitive).
        // Lowercase "creator" would be rejected by the DB if it ever bypasses toPrismaRole.
        defaultValue: "CREATOR",
        input: false,
      },
      hasCompletedOnboarding: {
        type: "boolean" as const,
        required: false,
        defaultValue: false,
        input: false,
      },
      banned: {
        type: "boolean" as const,
        required: false,
        defaultValue: false,
        input: false,
      },
      banReason: {
        type: "string" as const,
        required: false,
        defaultValue: "",
        input: false,
      },
    },
  },

  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({
          data: {
            ...user,
            role: toPrismaRole(user.role),
          },
        }),
      },
      update: {
        before: async (user) => {
          if (user.role === undefined) {
            return { data: user };
          }
          return {
            data: {
              ...user,
              role: toPrismaRole(user.role),
            },
          };
        },
      },
    },
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "GOOGLE_CLIENT_ID_PLACEHOLDER",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "GOOGLE_CLIENT_SECRET_PLACEHOLDER",
    },
    ...(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET
      ? {
          facebook: {
            clientId: process.env.FACEBOOK_CLIENT_ID,
            clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
          },
        }
      : {}),
  },

  baseURL:
    process.env.BETTER_AUTH_URL ??
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL,
  secret: process.env.BETTER_AUTH_SECRET!,
  trustedOrigins: [
    ...new Set(
      [
        process.env.BETTER_AUTH_URL,
        process.env.APP_URL,
        process.env.NEXT_PUBLIC_APP_URL,
        ...(process.env.ALLOWED_ORIGINS ?? "").split(","),
      ]
        .map((origin) => origin?.trim())
        .filter((origin): origin is string => Boolean(origin)),
    ),
  ],
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
