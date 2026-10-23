/**
 * Safe `?next=` handling for the auth pages (D-12 §8 / design §9.2).
 *
 * The login page used to accept ANY internal path with a naive
 * `startsWith("/") && !startsWith("//")` check (H-30). The only deep link that
 * legitimately needs to survive a login round-trip today is the public QR
 * acceptance route, so we validate `next` against an explicit allowlist
 * instead of accepting every internal path.
 *
 * Accepted: a relative path matching `/transfer/qr/<token>` where `<token>`
 * is a URL-safe segment. Everything else (absolute URLs, protocol-relative
 * `//host`, arbitrary app routes) is rejected and replaced by the fallback.
 */

/**
 * Allowlist pattern. The token charset (`A-Za-z0-9._~-`) covers the URL-safe
 * identifiers produced by the backend QR generator and the output of
 * `encodeURIComponent` for those tokens.
 */
const DEEP_LINK_PATTERN = /^\/transfer\/qr\/[A-Za-z0-9._~-]+$/;

/**
 * True only when `value` is a relative path matching the deep-link allowlist.
 * `//host` is rejected both by the pattern and by the explicit guard.
 */
export function isSafeNextPath(value: string | null | undefined): value is string {
  if (!value) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  return DEEP_LINK_PATTERN.test(value);
}

/**
 * Return `value` when it is a safe deep link, otherwise `fallback`
 * (default `/dashboard`) — prevents open redirects while preserving the QR
 * round-trip.
 */
export function resolveSafeNext(
  value: string | null | undefined,
  fallback = "/dashboard",
): string {
  return isSafeNextPath(value) ? value : fallback;
}
