/**
 * Shared new-password validation for the reset form and the Settings
 * change-password form. Returns the user-facing error message, or null when
 * the pair is acceptable.
 */
export function validateNewPassword(
  password: string,
  confirm: string,
): string | null {
  if (password.length < 8) {
    return "Use at least 8 characters for the new password.";
  }
  if (password !== confirm) {
    return "The two passwords don't match.";
  }
  return null;
}
