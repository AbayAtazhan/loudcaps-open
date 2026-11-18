import type { Template } from "./types";
import { makeStyle } from "./base-style";
import { ANIMATED_TEMPLATES } from "./animated-templates";

export { BASE_STYLE, makeStyle } from "./base-style";

export const TEMPLATES: Template[] = [
  {
    id: "loud",
    name: "Loud",
    blurb: "The scroll-stopper. Bold caps, the spoken word lights up.",
    style: makeStyle({
      activeColor: "#FFE600",
      emphasisColor: "#3DFF7A",
      stroke: { color: "#000000", width: 0.11 },
      shadow: { color: "rgba(0,0,0,0.55)", blur: 0.12, x: 0, y: 0.07 },
      entrance: "pop",
      activeScale: 1.08,
    }),
  },
  {
    id: "clean",
    name: "Clean",
    blurb: "Quiet and readable. For talking heads and tutorials.",
    style: makeStyle({
      font: "Inter",
      weight: 700,
      size: 5.4,
      textCase: "none",
      wordsPerPage: 5,
      punctuation: true,
      y: 0.78,
      emphasisColor: "#FFD84D",
      shadow: { color: "rgba(0,0,0,0.8)", blur: 0.32, x: 0, y: 0.04 },
      entrance: "fade",
    }),
  },
  {
    id: "boxed",
    name: "Boxed",
    blurb: "Readable on any footage, however busy.",
    style: makeStyle({
      font: "Poppins",
      weight: 700,
      size: 5.2,
      textCase: "none",
      wordsPerPage: 4,
      punctuation: true,
      leading: 1.5,
      activeColor: "#FFE600",
      box: { color: "rgba(8,8,8,0.86)", radius: 0.32, padX: 0.5, padY: 0.2, scope: "line" },
      entrance: "rise",
    }),
  },
  {
    id: "karaoke",
    name: "Karaoke",
    blurb: "Words fill with colour as they are spoken.",
    style: makeStyle({
      font: "Poppins",
      weight: 800,
      size: 6.2,
      wordsPerPage: 4,
      activeColor: "#19E3FF",
      spokenColor: "#19E3FF",
      upcomingOpacity: 0.5,
      fill: "sweep",
      stroke: { color: "#000000", width: 0.09 },
      entrance: "fade",
    }),
  },
  {
    id: "one-word",
    name: "One Word",
    blurb: "One huge word at a time. Fast and punchy.",
    style: makeStyle({
      font: "Anton",
      weight: 400,
      size: 12.5,
      tracking: 0.01,
      wordsPerPage: 1,
      maxLines: 1,
      y: 0.64,
      emphasisColor: "#FFE600",
      stroke: { color: "#000000", width: 0.07 },
      shadow: { color: "#000000", blur: 0, x: 0.045, y: 0.055 },
      entrance: "zoom",
    }),
  },
  {
    id: "subtitle",
    name: "Subtitle",
    blurb: "Classic lower-third subtitles. Nothing fancy.",
    style: makeStyle({
      font: "Inter",
      weight: 500,
      size: 4.1,
      textCase: "none",
      wordsPerPage: 7,
      punctuation: true,
      y: 0.87,
      leading: 1.3,
      box: { color: "rgba(0,0,0,0.62)", radius: 0.16, padX: 0.5, padY: 0.24, scope: "page" },
    }),
  },
  ...ANIMATED_TEMPLATES,
];

export const DEFAULT_TEMPLATE_ID = "loud";

export function getTemplate(id: string): Template {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}

/** Colours offered as one-tap swatches in the style panel. */
export const SWATCHES = [
  "#FFFFFF",
  "#0B0B0B",
  "#FFE600",
  "#3DFF7A",
  "#19E3FF",
  "#FF2E88",
  "#FF3B30",
  "#8B5CF6",
  "#FF9F1C",
];
