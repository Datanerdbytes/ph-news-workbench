import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { sql } from "@/lib/db";
import * as schema from "../auth-schema";

const db = drizzle(neon(process.env.DATABASE_URL!));

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL!,
  emailAndPassword: {
    enabled: true,
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;

      const submitted = (ctx.body as { inviteCode?: unknown } | undefined)
        ?.inviteCode;
      const code = typeof submitted === "string" ? submitted.trim() : "";

      const bootstrap = process.env.SIGNUP_INVITE_CODE?.trim();
      if (!code) {
        throw new APIError("BAD_REQUEST", {
          message: "Account creation is closed. Ask the owner for an invite.",
        });
      }

      if (bootstrap && code === bootstrap) return;

      const invites = await sql`
        SELECT id FROM workspace_invites
        WHERE id = ${code} AND accepted_at IS NULL AND expires_at > now()`;

      if (!invites.length) {
        throw new APIError("BAD_REQUEST", {
          message: "That invite code is not valid.",
        });
      }
    }),
  },
});
