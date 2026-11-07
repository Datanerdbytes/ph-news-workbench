/**
 * Auth email delivery. There is no email provider wired up yet — every auth
 * email (verification, password reset) is logged to the server console with a
 * greppable `[auth-mail]` marker, so the owner can copy the link from the
 * terminal. To send real email later (Resend, SMTP, …), replace the body of
 * `sendAuthEmail` and nothing else.
 */
export type AuthEmail = {
  to: string;
  subject: string;
  /** One sentence shown above the link in the email body. */
  intro: string;
  /** The action link better-auth generated (contains the action token). */
  url: string;
};

export async function sendAuthEmail({ to, subject, intro, url }: AuthEmail) {
  console.info(
    [
      "[auth-mail] ─────────────────────────────────────────────",
      `[auth-mail] to:      ${to}`,
      `[auth-mail] subject: ${subject}`,
      `[auth-mail] intro:   ${intro}`,
      `[auth-mail] link:    ${url}`,
      "[auth-mail] ─────────────────────────────────────────────",
    ].join("\n"),
  );
}
