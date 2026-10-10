/** Single-user app: only one email may sign in (tech-architecture.md §11). */
export function isAllowedEmail(email: string | null | undefined, allowed: string): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === allowed.trim().toLowerCase();
}
