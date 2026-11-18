import type { CaptionStyle } from "./types";

/** Every template starts from this and overrides what makes it distinct. */
export const BASE_STYLE: CaptionStyle = {
  font: "Montserrat",
  weight: 900,
  italic: false,
  size: 7.4,
  textCase: "upper",
  tracking: 0,
  leading: 1.14,
  maxWidth: 0.86,
  y: 0.72,
  wordsPerPage: 3,
  maxLines: 2,
  punctuation: false,
  color: "#FFFFFF",
  gradient: null,
  activeColor: null,
  emphasisColor: null,
  spokenColor: null,
  upcomingOpacity: 1,
  stroke: null,
  shadow: null,
  box: null,
  activeBox: null,
  activeScale: 1,
  entrance: "none",
  entranceScope: "page",
  tilt: 0,
  fill: "instant",
  fitLines: false,
  underline: null,
  glitch: false,
  cursor: false,
};

export function makeStyle(overrides: Partial<CaptionStyle>): CaptionStyle {
  return { ...BASE_STYLE, ...overrides };
}
