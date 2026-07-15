/**
 * The site slug grammar. A slug is a path segment on the public web server, a directory
 * name under three filesystem roots, and a git repo name — so it is deliberately narrow:
 * lowercase letters, digits and hyphens, starting with a letter, 2–40 chars. No dots
 * (path traversal / hidden files), no underscores (URL aesthetics), no uppercase
 * (case-insensitive filesystems).
 */

export const SLUG_PATTERN = /^[a-z][a-z0-9-]{1,39}$/;

export function isValidSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}
