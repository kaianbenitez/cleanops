import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/current-user";
import { hasAdminAccess, hasFieldAccess } from "@/lib/auth/field-staff";
import { resolveLandingSurface, SURFACE_COOKIE } from "@/lib/auth/surface";
import { hasAssignmentToday } from "@/lib/my-day/assignment";
import MarketingPage from "@/components/marketing/marketing-page";

// Covers phones on both iOS and Android; tablets fall through to the
// admin-default branch below, which the surface switcher (H6) can override.
const MOBILE_UA_PATTERN = /Mobi/i;

export const metadata: Metadata = {
  title: "ServiceSpark | Maid Service & Cleaning Business Software",
  description:
    "ServiceSpark is maid service and cleaning business software for scheduling, crew management, customer records, quotes, invoicing, and payroll — all in one place.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "ServiceSpark | Maid Service & Cleaning Business Software",
    description:
      "ServiceSpark is maid service and cleaning business software for scheduling, crew management, customer records, quotes, invoicing, and payroll — all in one place.",
    type: "website",
    images: [{ url: "/marketing/dashboard.jpg", width: 1568, height: 744, alt: "ServiceSpark dashboard for a cleaning business" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ServiceSpark | Maid Service & Cleaning Business Software",
    description:
      "ServiceSpark is maid service and cleaning business software for scheduling, crew management, customer records, quotes, invoicing, and payroll — all in one place.",
    images: ["/marketing/dashboard.jpg"],
  },
};

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) return <MarketingPage />;

  const isAdmin = hasAdminAccess(user);
  const hasField = hasFieldAccess(user);
  const rawSurfaceCookie = (await cookies()).get(SURFACE_COOKIE)?.value;
  const surfaceCookie = rawSurfaceCookie === "field" || rawSurfaceCookie === "admin" ? rawSurfaceCookie : undefined;
  const isMobile = MOBILE_UA_PATTERN.test((await headers()).get("user-agent") ?? "");

  // Only hit the DB for hybrids with no cookie yet — every other branch
  // resolves without it, and hasJobToday is unused when it does.
  const needsJobCheck = isAdmin && hasField && !surfaceCookie && isMobile;
  const hasJobToday = needsJobCheck ? await hasAssignmentToday(user.id, user.companyId) : false;

  redirect(resolveLandingSurface({ isAdmin, hasField, surfaceCookie, isMobile, hasJobToday }));
}
