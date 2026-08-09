import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cleanops-orcin.vercel.app";
  return [{ url: baseUrl, changeFrequency: "monthly", priority: 1 }];
}
