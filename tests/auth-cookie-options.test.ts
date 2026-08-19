import assert from "node:assert/strict";
import test from "node:test";
import { AUTH_COOKIE_OPTIONS, AUTH_COOKIE_MAX_AGE_SECONDS } from "../src/lib/supabase/cookie-options";

test("auth cookies remain available for refresh instead of expiring with the browser session", () => {
  assert.equal(AUTH_COOKIE_MAX_AGE_SECONDS, 400 * 24 * 60 * 60);
  assert.deepEqual(AUTH_COOKIE_OPTIONS, {
    path: "/",
    sameSite: "lax",
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
  });
});
