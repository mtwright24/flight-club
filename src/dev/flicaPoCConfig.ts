/**
 * TEMP PoC — JetBlue FLICA manual web-auth test. Remove when superseded.
 * Public entry URL only; no secrets.
 */
export const JETBLUE_FLICA_ENTRY_URL = 'https://jetblue.flica.net/';

/** Legacy CGI logon (backup flows may still use). */
export const JETBLUE_FLICA_LOGON_URL = 'https://jetblue.flica.net/public/flicalogon.cgi';

/** FCV / Charles: hidden WebView must load this UI login page (not flicalogon) for correct headers + CAPTCHA flow. */
export const JETBLUE_FLICA_UI_LOGIN_URL = 'https://jetblue.flica.net/ui/public/login/index.html';

/** Match FCV fetch / Mobile Safari so JetBlue accepts the session. */
export const FLICA_WEBVIEW_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

/** Heuristic: still on auth / gatekeeper pages */
export const FLICA_LOGIN_URL_HINT = /login|signin|auth|oauth|sso|gatekeeper/i;
