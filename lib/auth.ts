import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { sql } from "@/lib/db";
import { sendAuthEmail } from "@/lib/mailer";
import * as schema from "../auth-schema";

const db = drizzle(neon(process.env.DATABASE_URL!));

/**
 * Sign-in lockout: after this many consecutive wrong passwords an email is
 * locked out for LOCK_MINUTES. Correct passwords clear the count; the count
 * also decays on its own after FAILURE_WINDOW_MINUTES of quiet.
 */
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const FAILURE_WINDOW_MINUTES = 30;

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

type SignUpResponse = { user?: { id?: string } };

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL!,
  // Extra browser origins allowed to call the auth API (comma-separated).
  // better-auth otherwise trusts only baseURL, which rejects Vercel's other
  // aliases and preview deployments.
  trustedOrigins: (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  emailAndPassword: {
    enabled: true,
    // Sign-in is refused with 403 EMAIL_NOT_VERIFIED until the user opens the
    // verification link sent at sign-up. The seeded owner is pre-verified.
    requireEmailVerification: true,
    // Verification and reset links land in the server console (lib/mailer).
    sendResetPassword: async ({ user, url }) =>
      sendAuthEmail({
        to: user.email,
        subject: "Reset your workbench password",
        intro:
          "Use this link to choose a new password for your News Workbench account. It expires in one hour.",
        url,
      }),
  },
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) =>
      sendAuthEmail({
        to: user.email,
        subject: "Verify your workbench email",
        intro:
          "Use this link to verify your email address. Sign-in stays locked until it is verified.",
        url,
      }),
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-in/email") {
        // Refuse sign-ins for locked accounts before the password check runs.
        // Fails open: a missing table or DB hiccup must never block sign-in.
        const email = normalizeEmail(
          (ctx.body as { email?: unknown } | undefined)?.email,
        );
        if (!email) return;

        try {
          const locks = (await sql`
            SELECT locked_until FROM sign_in_locks
            WHERE email = ${email} AND locked_until > now()`) as unknown as {
            locked_until: Date | string;
          }[];
          if (locks.length) {
            const until = new Date(locks[0].locked_until).getTime();
            const minutes = Math.max(
              1,
              Math.ceil((until - Date.now()) / 60_000),
            );
            throw new APIError("FORBIDDEN", {
              message: `Too many failed sign-in attempts. This account is locked — try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
            });
          }
        } catch (error) {
          if (isAPIError(error)) throw error;
          console.error("[auth] lock check failed (failing open):", error);
        }
        return;
      }

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
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email") {
        // Bind the invite right after the account is created: consume it and
        // insert workspace membership in the same breath, so an invited user
        // never gets a self-provisioned owner workspace. The before-hook only
        // validated the code — consuming here (not there) keeps a failed
        // sign-up from burning the invite.
        const submitted = (ctx.body as { inviteCode?: unknown } | undefined)
          ?.inviteCode;
        const code = typeof submitted === "string" ? submitted.trim() : "";

        const returned = ctx.context.returned as SignUpResponse | undefined;
        let userId =
          returned && !isAPIError(returned) ? returned.user?.id : undefined;

        const bootstrap = process.env.SIGNUP_INVITE_CODE?.trim();
        if (!code || (bootstrap && code === bootstrap)) return;

        try {
          // Fallback when the response shape didn't carry the user id.
          if (!userId) {
            const email = normalizeEmail(
              (ctx.body as { email?: unknown } | undefined)?.email,
            );
            if (!email) return;
            const found = (await sql`
              SELECT id FROM "user" WHERE lower(email) = ${email} LIMIT 1`) as unknown as {
              id: string;
            }[];
            userId = found[0]?.id;
          }
          if (!userId) return;

          const consumed = (await sql`
            UPDATE workspace_invites
            SET accepted_by = ${userId}, accepted_at = now()
            WHERE id = ${code} AND accepted_at IS NULL
            RETURNING workspace_id`) as unknown as { workspace_id: string }[];

          if (consumed.length) {
            await sql`
              INSERT INTO workspace_members (workspace_id, user_id, role)
              VALUES (${consumed[0].workspace_id}, ${userId}, 'editor')
              ON CONFLICT DO NOTHING`;
          }
        } catch (error) {
          // Sign-up already succeeded; the accept endpoint remains as the
          // fallback path for joining the workspace.
          console.error("[auth] invite binding failed:", error);
        }
        return;
      }

      if (ctx.path !== "/sign-in/email") return;

      const email = normalizeEmail(
        (ctx.body as { email?: unknown } | undefined)?.email,
      );
      if (!email) return;

      const returned = ctx.context.returned;
      if (returned && !isAPIError(returned)) {
        // Successful sign-in — clear any failed-attempt tally.
        try {
          await sql`DELETE FROM sign_in_locks WHERE email = ${email}`;
        } catch (error) {
          console.error("[auth] lockout reset failed:", error);
        }
        return;
      }

      // Count only wrong-password failures: UNAUTHORIZED is the status of
      // INVALID_EMAIL_OR_PASSWORD. Unverified-email (FORBIDDEN), malformed
      // bodies (BAD_REQUEST) and rate-limit responses do not count.
      if (!isAPIError(returned) || returned.status !== "UNAUTHORIZED") return;

      try {
        const rows = (await sql`
          INSERT INTO sign_in_locks (email, failed_attempts, last_failure_at)
          VALUES (${email}, 1, now())
          ON CONFLICT (email) DO UPDATE SET
            failed_attempts = CASE
              WHEN sign_in_locks.last_failure_at > now()
                - make_interval(mins => ${FAILURE_WINDOW_MINUTES})
              THEN sign_in_locks.failed_attempts + 1
              ELSE 1
            END,
            last_failure_at = now()
          RETURNING failed_attempts`) as unknown as { failed_attempts: number }[];

        const attempts = rows[0]?.failed_attempts ?? 0;
        if (attempts >= MAX_FAILED_ATTEMPTS) {
          const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
          await sql`
            UPDATE sign_in_locks
            SET locked_until = ${lockedUntil.toISOString()}::timestamptz,
                failed_attempts = 0
            WHERE email = ${email}`;
        }
      } catch (error) {
        console.error("[auth] lockout accounting failed:", error);
      }
    }),
  },
});
