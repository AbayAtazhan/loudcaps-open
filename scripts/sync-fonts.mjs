#!/usr/bin/env node
/**
 * Copies the caption fonts out of the @fontsource packages into public/fonts and
 * writes the manifest the renderer uses to register them with the FontFace API.
 *
 * The output is committed, so you only need to run this when you add a font:
 *   1. npm i @fontsource/<name>
 *   2. add it to FONTS below
 *   3. npm run fonts
 *
 * The original copyright and licence notices are copied with the fonts.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "fonts");
const noticesDir = join(outDir, "licenses");
const manifestPath = join(root, "src", "lib", "captions", "font-manifest.json");

/** Subsets worth shipping. Anything else falls back to the viewer's system fonts. */
const SUBSETS = ["latin", "latin-ext", "cyrillic", "cyrillic-ext", "vietnamese", "greek"];

const FONTS = [
  { family: "Montserrat", pkg: "montserrat", weights: [700, 800, 900] },
  { family: "Inter", pkg: "inter", weights: [500, 600, 700, 800] },
  { family: "Poppins", pkg: "poppins", weights: [600, 700, 800, 900] },
  { family: "DM Sans", pkg: "dm-sans", weights: [500, 700] },
  { family: "Anton", pkg: "anton", weights: [400] },
  { family: "Bebas Neue", pkg: "bebas-neue", weights: [400] },
  { family: "Oswald", pkg: "oswald", weights: [600, 700] },
  { family: "Archivo Black", pkg: "archivo-black", weights: [400] },
  { family: "Bangers", pkg: "bangers", weights: [400] },
  { family: "Luckiest Guy", pkg: "luckiest-guy", weights: [400] },
  { family: "Fredoka", pkg: "fredoka", weights: [600, 700] },
  { family: "Permanent Marker", pkg: "permanent-marker", weights: [400] },
  { family: "Playfair Display", pkg: "playfair-display", weights: [700, 800], italics: [700, 800] },
  { family: "Space Mono", pkg: "space-mono", weights: [700] },
  { family: "Rubik", pkg: "rubik", weights: [700, 800, 900] },
  { family: "Unbounded", pkg: "unbounded", weights: [700, 900] },
];

if (existsSync(outDir)) {
  for (const f of readdirSync(outDir)) if (f.endsWith(".woff2")) rmSync(join(outDir, f));
}
mkdirSync(outDir, { recursive: true });
mkdirSync(noticesDir, { recursive: true });

const manifest = {};
const licenses = [];
let count = 0;
let bytes = 0;

for (const font of FONTS) {
  const pkgDir = join(root, "node_modules", "@fontsource", font.pkg);
  if (!existsSync(pkgDir)) throw new Error(`Missing package @fontsource/${font.pkg}. Run npm install first.`);
  const ranges = JSON.parse(readFileSync(join(pkgDir, "unicode.json"), "utf8"));
  const faces = [];
  const variants = [
    ...font.weights.map((weight) => ({ weight, style: "normal" })),
    ...(font.italics ?? []).map((weight) => ({ weight, style: "italic" })),
  ];
  for (const { weight, style } of variants) {
    for (const subset of SUBSETS) {
      const file = `${font.pkg}-${subset}-${weight}-${style}.woff2`;
      const src = join(pkgDir, "files", file);
      if (!existsSync(src) || !ranges[subset]) continue;
      copyFileSync(src, join(outDir, file));
      bytes += readFileSync(src).length;
      count++;
      faces.push({ weight, style, subset, range: ranges[subset], file });
    }
  }
  if (!faces.length) throw new Error(`No font files found for ${font.family}`);
  manifest[font.family] = {
    weights: font.weights,
    italics: font.italics ?? [],
    faces,
  };
  const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  const notice = `${font.pkg}.txt`;
  copyFileSync(join(pkgDir, "LICENSE"), join(noticesDir, notice));
  licenses.push(`- **${font.family}**: [${pkg.license}](licenses/${notice}), via @fontsource/${font.pkg}@${pkg.version}`);
}

for (const name of ["archivo", "instrument-sans"]) {
  const pkgDir = join(root, "node_modules", "@fontsource-variable", name);
  const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  const notice = `${name}-variable.txt`;
  copyFileSync(join(pkgDir, "LICENSE"), join(noticesDir, notice));
  licenses.push(`- **${name} (variable)**: [${pkg.license}](licenses/${notice}), via @fontsource-variable/${name}@${pkg.version}`);
}

writeFileSync(manifestPath, JSON.stringify(manifest) + "\n");
writeFileSync(
  join(outDir, "LICENSES.md"),
  `# Font licenses\n\nThe app redistributes these fonts under their original licenses. Each link contains the notice copied from the dependency used to build the app.\n\n${licenses.join("\n")}\n`,
);

console.log(`Synced ${count} font files (${(bytes / 1024 / 1024).toFixed(2)} MB) for ${FONTS.length} families.`);
