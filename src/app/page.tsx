import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/current-user";
import MarketingPage from "@/components/marketing/marketing-page";

export const metadata: Metadata = {
  title: "ServiceSpark | Cleaning business operations software",
  description:
    "Keep scheduling, crew work, customer details, quotes, invoicing, and payroll in one clear workspace for your cleaning business.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "ServiceSpark | Cleaning business operations software",
    description:
      "Keep scheduling, crew work, customer details, quotes, invoicing, and payroll in one clear workspace for your cleaning business.",
    type: "website",
    images: [{ url: "/marketing/scheduling.jpg", width: 1568, height: 744, alt: "ServiceSpark cleaning business schedule" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ServiceSpark | Cleaning business operations software",
    description:
      "Keep scheduling, crew work, customer details, quotes, invoicing, and payroll in one clear workspace for your cleaning business.",
    images: ["/marketing/scheduling.jpg"],
  },
};

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) return <MarketingPage />;
  redirect(user.role === "admin" ? "/dashboard" : "/my-day");
}
