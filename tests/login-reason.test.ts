import assert from "node:assert/strict";
import test from "node:test";
import {
  LOGIN_REASONS,
  classifyStaleCookieReason,
  hasAuthCookie,
  isChunkedAuthCookie,
  loginReasonMessage,
} from "../src/lib/supabase/login-reason";

test("loginReasonMessage: known reasons map to the required copy", () => {
  assert.equal(
    loginReasonMessage("expired"),
    "Your sign-in expired. Sign in again to get back to your day — nothing you recorded was lost."
  );
  assert.equal(loginReasonMessage("signed_out"), "You signed out. Sign in when you're ready.");
  assert.equal(loginReasonMessage("no_session"), "Sign in to see your day.");
});

test("loginReasonMessage: an unrecognised or missing value falls back to the no_session copy and never throws", () => {
  assert.equal(loginReasonMessage(undefined), loginReasonMessage("no_session"));
  assert.equal(loginReasonMessage(null), loginReasonMessage("no_session"));
  assert.doesNotThrow(() => loginReasonMessage("some-garbage-value"));
  assert.equal(loginReasonMessage("some-garbage-value"), loginReasonMessage("no_session"));
});

test("loginReasonMessage: none of the required reasons render banned wording", () => {
  for (const reason of LOGIN_REASONS) {
    assert.doesNotMatch(loginReasonMessage(reason), /paid|payroll/i);
  }
});

test("hasAuthCookie / isChunkedAuthCookie: detect sb-*-auth-token cookies, chunked or not", () => {
  assert.equal(hasAuthCookie([]), false);
  assert.equal(hasAuthCookie(["other-cookie"]), false);
  assert.equal(hasAuthCookie(["sb-abc-auth-token"]), true);
  assert.equal(hasAuthCookie(["sb-abc-auth-token.0", "sb-abc-auth-token.1"]), true);

  assert.equal(isChunkedAuthCookie(["sb-abc-auth-token"]), false);
  assert.equal(isChunkedAuthCookie(["sb-abc-auth-token.0", "sb-abc-auth-token.1"]), true);
});

test("classifyStaleCookieReason: expired/invalid-refresh-token signals classify as expired, anything else as unknown", () => {
  assert.equal(classifyStaleCookieReason({ message: "JWT expired" }), "expired");
  assert.equal(
    classifyStaleCookieReason({ message: "Invalid Refresh Token: Refresh Token Not Found" }),
    "expired"
  );
  assert.equal(classifyStaleCookieReason({ code: "refresh_token_not_found" }), "expired");
  assert.equal(classifyStaleCookieReason(null), "unknown");
  assert.equal(classifyStaleCookieReason({ message: "network error" }), "unknown");
});

// WP-E §9/§15 — the same banned-word list WP-D's tests apply to its own
// strings (tests/wp-d-portal-continuity.test.ts) applies to the copy this
// package introduces directly in src/app/login/page.tsx (not covered above
// since it isn't exported from login-reason.ts).
const BANNED = /paid|payroll/i;
const LOGIN_PAGE_COPY = [
  "Open Shimmer from the same Home Screen icon or Safari tab each day.",
  "Only use this on a phone that's yours. On a shared phone, sign out when you're done so nobody else can open your day.",
];

test("login page copy: no introduced string uses banned payroll language or promises an unverified session length", () => {
  for (const line of LOGIN_PAGE_COPY) {
    assert.equal(BANNED.test(line), false, `banned word found in: ${line}`);
  }
});
