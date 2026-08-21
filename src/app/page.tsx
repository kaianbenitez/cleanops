import type { Metadata } from "next";
import MarketingPage from "@/components/marketing/marketing-page";
import { marketingFaq } from "@/components/marketing/marketing-faq-data";

export const metadata: Metadata = {
  title: "Shimmer | Maid Service & Cleaning Business Software",
  description:
    "Shimmer is maid service and cleaning business software for scheduling, crew management, customer records, quotes, invoicing, and payroll, all in one place.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Shimmer | Maid Service & Cleaning Business Software",
    description:
      "Shimmer is maid service and cleaning business software for scheduling, crew management, customer records, quotes, invoicing, and payroll, all in one place.",
    type: "website",
    images: [
      {
        url: "/marketing/dashboard.jpg",
        width: 1489,
        height: 812,
        alt: "Shimmer dashboard for a cleaning business",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Shimmer | Maid Service & Cleaning Business Software",
    description:
      "Shimmer is maid service and cleaning business software for scheduling, crew management, customer records, quotes, invoicing, and payroll, all in one place.",
    images: ["/marketing/dashboard.jpg"],
  },
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://getshimmer.app";

function MarketingJsonLd() {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Shimmer",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description:
        "Shimmer is maid service and cleaning business software for scheduling, crew management, customer records, quotes, invoicing, and payroll, all in one place.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        description: "Free during beta",
      },
      url: SITE_URL,
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Shimmer",
      url: SITE_URL,
      email: "hello@getshimmer.app",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Manila",
        addressCountry: "PH",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: marketingFaq.map(({ question, answer }) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    },
  ];

  // Static, server-generated JSON-LD only, no user input reaches this string.
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

// The logged-in redirect (admin vs field, mobile vs desktop, cookie
// override) lives in middleware.ts now, which already runs on `/` and
// already has the session. This component reads no cookies() or headers(),
// so `/` renders as a static, cacheable marketing page.
export default function Home() {
  return (
    <>
      <MarketingJsonLd />
      <MarketingPage />
    </>
  );
}
