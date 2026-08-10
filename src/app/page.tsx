import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/current-user";
import MarketingPage from "@/components/marketing/marketing-page";

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
    images: [{ url: "/marketing/scheduling.jpg", width: 1568, height: 744, alt: "ServiceSpark cleaning business schedule" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ServiceSpark | Maid Service & Cleaning Business Software",
    description:
      "ServiceSpark is maid service and cleaning business software for scheduling, crew management, customer records, quotes, invoicing, and payroll — all in one place.",
    images: ["/marketing/scheduling.jpg"],
  },
};

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) return <MarketingPage />;
  redirect(user.role === "admin" ? "/dashboard" : "/my-day");
}
