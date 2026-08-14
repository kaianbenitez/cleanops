import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/current-user";
import { hasAdminAccess, hasFieldAccess } from "@/lib/auth/field-staff";
import { SURFACE_COOKIE } from "@/lib/auth/surface";
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

  if (!hasAdminAccess(user)) redirect("/my-day");
  if (!hasFieldAccess(user)) redirect("/dashboard");

  // Hybrid admin + field staff from here — resolve on device/context instead
  // of role, per the precedence order in Hybrid Employee Access Plan.md.
  const cookieStore = await cookies();
  const surface = cookieStore.get(SURFACE_COOKIE)?.value;
  if (surface === "field") redirect("/my-day");
  if (surface === "admin") redirect("/dashboard");

  const userAgent = (await headers()).get("user-agent") ?? "";
  if (MOBILE_UA_PATTERN.test(userAgent) && (await hasAssignmentToday(user.id, user.companyId))) {
    redirect("/my-day");
  }

  redirect("/dashboard");
}
