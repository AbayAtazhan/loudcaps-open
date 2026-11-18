import type { Metadata, Viewport } from "next";
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource-variable/instrument-sans";
import "./globals.css";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name}: free AI captions for TikTok, Reels and Shorts`, template: `%s · ${site.name}` },
  description: site.description,
  applicationName: site.name,
  openGraph: { images: [`${site.url}/og.png`], type: "website", siteName: site.name, title: `${site.name}: ${site.tagline}`, description: site.description, url: site.url },
  twitter: { card: "summary_large_image", title: `${site.name}: ${site.tagline}`, description: site.description },
};

export const viewport: Viewport = { themeColor: "#09090b", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
