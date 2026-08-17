import type { Metadata } from "next";
import MarketingPage from "@/components/marketing/marketing-page";

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
    images: [{ url: "/marketing/dashboard.jpg", width: 1489, height: 812, alt: "Shimmer dashboard for a cleaning business" }],
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

// Plain-text mirror of marketing-faq.tsx's questions, for FAQPage JSON-LD
// only. Kept separate because that array's answers are JSX (one links to
// /privacy-policy), not serializable strings. Update both together.
const FAQ_JSON_LD_ITEMS = [
  {
    q: "What is Shimmer?",
    a: "Operations software built specifically for residential and commercial cleaning businesses: scheduling, a crew app, customer records, online quotes, invoicing, and payroll, all in one place.",
  },
  {
    q: "What happens to pricing after the beta?",
    a: "Free while we're in beta. When we do start charging we'll give you at least 30 days' notice, and you'll never be billed by surprise.",
  },
  {
    q: "I don't have time to enter all my clients, can you help?",
    a: "Yes, send us your customer list however you have it and we'll get it set up in your account for you.",
  },
  {
    q: "What happens to my information? Do I still own it?",
    a: "Yes, it's yours. We only use your data to run your account; see our Privacy Policy for the details.",
  },
  {
    q: "Do my cleaners need to download an app?",
    a: "No, it opens right in their phone's browser, nothing to install.",
  },
  {
    q: "Is customer access info like gate codes secure?",
    a: "Kept masked in the system, only revealed to the assigned technician.",
  },
  {
    q: "Does it handle payroll too?",
    a: "Yes, payroll is generated from tracked clock-in/out time, with tiered hourly rates and commission support.",
  },
] as const;

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
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "Free during beta" },
      url: SITE_URL,
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Shimmer",
      url: SITE_URL,
      email: "hello@getshimmer.app",
      address: { "@type": "PostalAddress", addressLocality: "Manila", addressCountry: "PH" },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ_JSON_LD_ITEMS.map(({ q, a }) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    },
  ];

  // Static, server-generated JSON-LD only, no user input reaches this string.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />;
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
