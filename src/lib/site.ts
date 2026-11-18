/**
 * Everything brand- or business-specific lives here and in `.env`.
 * Fork-friendly: change these values and the whole site follows.
 */
export const site = {
  name: "LoudCaps",
  tagline: "Captions that get watched.",
  description:
    "Free, open-source AI captions for TikTok, Reels and Shorts. Runs in your browser: no upload, no sign-up, no watermark.",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://abayatazhan.github.io/loudcaps-open").replace(/\/$/, ""),
  repo: process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/AbayAtazhan/loudcaps-open",
};

export function sitePath(path: `/${string}`): string {
  return `${(process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "")}${path}`;
}
