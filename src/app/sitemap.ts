import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/studio/", "/privacy/", "/terms/"].map((path) => ({ url: `${site.url}${path}`, changeFrequency: "weekly" as const }));
}
