import assert from "node:assert/strict";
import test from "node:test";
import { hasAdminAccess, hasFieldAccess, isHybridEmployee } from "@/lib/auth/field-staff";
import { resolveLandingSurface } from "@/lib/auth/surface";

test("hasFieldAccess covers plain employees, office-only admins, and hybrids", () => {
  assert.equal(hasFieldAccess({ role: "employee", isFieldStaff: false }), true);
  assert.equal(hasFieldAccess({ role: "admin", isFieldStaff: false }), false);
  assert.equal(hasFieldAccess({ role: "admin", isFieldStaff: true }), true);
});

test("hasAdminAccess is role-only, independent of field-staff status", () => {
  assert.equal(hasAdminAccess({ role: "admin" }), true);
  assert.equal(hasAdminAccess({ role: "employee" }), false);
});

test("isHybridEmployee only enables surface switching for admin field staff", () => {
  assert.equal(isHybridEmployee({ role: "employee", isFieldStaff: true }), false);
  assert.equal(isHybridEmployee({ role: "admin", isFieldStaff: false }), false);
  assert.equal(isHybridEmployee({ role: "admin", isFieldStaff: true }), true);
});

test("resolveLandingSurface: plain employee always lands on /my-day", () => {
  const base = { isAdmin: false, hasField: true, surfaceCookie: undefined, isMobile: false, hasJobToday: false } as const;
  assert.equal(resolveLandingSurface(base), "/my-day");
  assert.equal(resolveLandingSurface({ ...base, isMobile: true, hasJobToday: false }), "/my-day");
});

test("resolveLandingSurface: office-only admin (no field access) always lands on /dashboard", () => {
  const base = { isAdmin: true, hasField: false, surfaceCookie: undefined, isMobile: true, hasJobToday: true } as const;
  assert.equal(resolveLandingSurface(base), "/dashboard");
  assert.equal(resolveLandingSurface({ ...base, surfaceCookie: "field" }), "/dashboard");
});

test("resolveLandingSurface: hybrid — the ss_surface cookie beats device/job signals in both directions", () => {
  const hybridMobileWithJob = { isAdmin: true, hasField: true, isMobile: true, hasJobToday: true } as const;
  assert.equal(resolveLandingSurface({ ...hybridMobileWithJob, surfaceCookie: "admin" }), "/dashboard");
  const hybridDesktopNoJob = { isAdmin: true, hasField: true, isMobile: false, hasJobToday: false } as const;
  assert.equal(resolveLandingSurface({ ...hybridDesktopNoJob, surfaceCookie: "field" }), "/my-day");
});

test("resolveLandingSurface: hybrid with no cookie falls back to mobile UA + an assignment today", () => {
  const noCookie = { isAdmin: true, hasField: true, surfaceCookie: undefined } as const;
  assert.equal(resolveLandingSurface({ ...noCookie, isMobile: true, hasJobToday: true }), "/my-day");
  assert.equal(resolveLandingSurface({ ...noCookie, isMobile: true, hasJobToday: false }), "/dashboard");
  assert.equal(resolveLandingSurface({ ...noCookie, isMobile: false, hasJobToday: true }), "/dashboard");
});
