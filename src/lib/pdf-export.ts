"use client";

import jsPDF from "jspdf";
import type { SectionWithEntries, CVDesign } from "@/types/database";
import {
  getFontStack,
  getTemplate,
  getPalette,
  SPACING_VALUES,
  getLineHeightValue,
  type ColorPalette,
  type TemplateConfig,
} from "@/lib/design-constants";
import {
  sanitizeFlowText as sanitizeText,
  resolveHeadingStyle,
  contentBoxWidthPx,
  contentBoxHeightPx,
  pageMarginPx,
  HEADER_TITLE_STRUT_PX,
  NAME_STRUT_PX,
  NAME_MARGIN_PX,
  PHOTO_PX,
  headerTextStrutsBoxPx,
  CONTACT_LINE_PX,
  computeFlowBlocks,
  paginate,
  contactLines,
  type ContactLine,
  type FlowMeasure,
  type FlowChunk,
} from "@/lib/cv-flow-layout";

/**
 * Structure that fully describes the CV for vector PDF rendering.
 * The caller flattens the React state into this plain object so the
 * export function is UI-agnostic and never touches the DOM.
 */
export interface PdfCVData {
  profileName: string;
  profileTitle: string;
  profilePicture?: string | null; // data-URL or null
  sections: SectionWithEntries[];
  design: Partial<CVDesign>;
  activeLang: string;
}

interface PdfExportOptions {
  /** Filename (without extension) */
  profileName?: string;
  /** Whether to include the photo */
  includePhoto?: boolean;
  /** "save" (default, browser download) or "arraybuffer" (returns bytes — used by tests/harnesses) */
  output?: "save" | "arraybuffer";
  /** Multi-language merged export: ordered plan (PRIMARY FIRST). Every
   *  language gets its own flow-paginated pages with its own profile header,
   *  appended into the same PDF. The per-language profile name/title must be
   *  RESOLVED by the caller (translation override or primary fallback), and
   *  the codes are joined into the filename (…_hu-en.pdf).
   *  Undefined/empty = single-language export of data.activeLang (default). */
  allLanguages?: { code: string; name: string; title: string }[];
  /** TEST/HARNESS HOOK (Step 8): per-style baseline anchor ratios measured
   *  in the real browser — keys "<i?><weight>|<fsPx>|<strutPx>" exactly as
   *  probeStyleRatios()/scripts/capture-preview-boxes.js produce them
   *  (`probeRatios`). When present, the DOM probe is skipped and these are
   *  authoritative; a missing key falls back to the canvas/fallback ratio.
   *  scripts/cv-row-parity.js --browser-metrics uses it to reproduce the
   *  in-browser export's placement under Node. */
  baselineRatios?: Record<string, number>;
}

// ─── Font embedding ───────────────────────────────────────────────────────────
//
// The on-screen preview uses Google Fonts; the PDF embeds the same typefaces
// as vector TrueType subsets so text stays selectable and zoom-sharp, and the
// document looks exactly like the preview.
//
// Fontsource (the npm font CDN used by the Google Fonts link tag) serves each
// family as COMPLEMENTARY subsets: the `latin` build has core glyphs, the
// `latin-ext` build has Central European glyphs (ő, ű, č...) — neither alone
// is complete, and jsPDF's built-in TTF parser chokes on multi-range cmaps in
// the raw subset files. So at build time (scripts/build-fonts.py) we merge
// latin + latin-ext into one clean TTF per family+style and ship them in
// /public/fonts/cv/ alongside a manifest.json. At export time we fetch the
// merged file, register all four styles (skipping italics for fonts that
// don't ship them), and fall back to jsPDF's built-in Helvetica/Times when a
// file or the network is unavailable.

interface FontCacheEntry {
  /** Fetched font files (base64), cached once per font id */
  files?: Record<FontStyle, { file: string; b64: string }>;
  /** Whether italics exist for this family (metadata only) */
  hasItalic: boolean;
  /** Whether a previous fetch attempt found no usable files (don't refetch) */
  unavailable?: boolean;
}

type FontStyle = "normal" | "bold" | "italic" | "bolditalic" | "medium" | "semibold";

/** App font ids (same values as design-constants FONT_OPTIONS) */
const FONT_IDS = new Set([
  "inter", "plus-jakarta", "source-sans", "lora", "garamond",
  "merriweather", "manrope", "noto-sans", "poppins", "montserrat",
  "roboto", "open-sans", "playfair", "crimson", "raleway", "karla",
  "ibm-plex",
]);

/** App font id -> whether italic styles exist in public/fonts/cv/manifest.json */
const HAS_ITALIC: Record<string, boolean> = {
  inter: true,
  "plus-jakarta": false,
  "source-sans": true,
  lora: true,
  garamond: true,
  merriweather: true,
  manrope: false,
  "noto-sans": true,
  poppins: true,
  montserrat: true,
  roboto: true,
  "open-sans": true,
  playfair: true,
  crimson: true,
  raleway: true,
  karla: true,
  "ibm-plex": true,
};

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)) as unknown as number[]
    );
  }
  return btoa(binary);
}

const fontCache = new Map<string, FontCacheEntry>();

/**
 * jsPDF gotcha: each registered family+style is looked up by exact name, and
 * built-in "helvetica"/"times" cannot be reassigned. We register each style
 * file under a UNIQUE family name ("<Label>-<style>") that provides only the
 * "normal" style, then map logical styles to these families in setFont().
 * A missing style transparently falls back to a registered sibling, then to
 * the built-ins.
 */
interface FontRegistration {
  /** The family name to pass to doc.setFont for each logical style */
  styleFam: Record<FontStyle, string>;
  /** Whether italics actually exist for this family */
  hasItalic: boolean;
}

async function registerFontFamily(
  doc: jsPDF,
  fontValue: string
): Promise<FontRegistration | null> {
  // jsPDF font registration (addFileToVFS/addFont) is PER-DOCUMENT: the cache
  // must only memoize the fetched font files, never the registration itself.
  // Every export creates a fresh jsPDF doc, so we re-register from cache on
  // each call (no network after the first fetch).
  let cached = fontCache.get(fontValue);

  if (!cached) {
    if (!FONT_IDS.has(fontValue)) return null;
    const hasItalic = HAS_ITALIC[fontValue] ?? false;

    const styleDefs: Array<{ key: FontStyle; suffix: string }> = [
      { key: "normal", suffix: "400" },
      { key: "bold", suffix: "700" },
      // The preview's font-medium (subtitle, year) / font-semibold (entry
      // titles, minimal headings) faces — weight parity, REPORT §4 Step 8.
      // A family without a static 500/600 file simply skips the fetch and
      // the resolution chain below falls back like CSS weight matching.
      { key: "medium", suffix: "500" },
      { key: "semibold", suffix: "600" },
      ...(hasItalic
        ? ([
            { key: "italic", suffix: "400-italic" },
            { key: "bolditalic", suffix: "700-italic" },
          ] as const)
        : []),
    ];

    const files: Partial<Record<FontStyle, { file: string; b64: string }>> = {};
    for (const def of styleDefs) {
      const file = `${fontValue}-${def.suffix}.ttf`;
      try {
        const res = await fetch(`/fonts/cv/${file}`, { cache: "force-cache" });
        if (!res.ok) continue;
        const buffer = await res.arrayBuffer();
        // Accept only TrueType (0x00010000) — the build script guarantees it
        if (new DataView(buffer).getUint32(0) !== 0x00010000) continue;
        files[def.key] = { file, b64: toBase64(buffer) };
      } catch {
        // network/file unavailable — fall back for this style
      }
    }

    cached = {
      hasItalic: Boolean(files.italic),
      files: Object.keys(files).length
        ? (files as Record<FontStyle, { file: string; b64: string }>)
        : undefined,
      unavailable: !Object.keys(files).length,
    };
    fontCache.set(fontValue, cached);
  }

  if (cached.unavailable || !cached.files) return null;

  const label = fontValue
    .split("-")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("");

  const styleFam: Partial<Record<FontStyle, string>> = {};
  for (const [key, { file, b64 }] of Object.entries(cached.files) as Array<
    [FontStyle, { file: string; b64: string }]
  >) {
    // Family name: "Inter" for normal, "Inter-bold"/"Inter-italic"/... for styles
    const famName = key === "normal" ? label : `${label}-${key}`;
    doc.addFileToVFS(file, b64);
    doc.addFont(file, famName, "normal");
    styleFam[key] = famName;
  }

  const resolved: Record<FontStyle, string> = {
    normal: styleFam.normal ?? "helvetica",
    bold: styleFam.bold ?? styleFam.normal ?? "helvetica",
    italic: styleFam.italic ?? styleFam.normal ?? "helvetica",
    bolditalic: styleFam.bolditalic ?? styleFam.bold ?? styleFam.normal ?? "helvetica",
    // CSS weight matching: a missing 500 resolves to the 400 face first,
    // a missing 600 to the 700 face (spec: desired 500 looks below first,
    // desired 600 looks above first).
    medium: styleFam.medium ?? styleFam.normal ?? "helvetica",
    semibold: styleFam.semibold ?? styleFam.bold ?? styleFam.normal ?? "helvetica",
  };

  return {
    styleFam: resolved,
    hasItalic: cached.hasItalic,
  };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Parse a CSS color string (#hex, rgb(), 3-digit hex) into jsPDF RGB channels 0–1 */
function parseColor(color: string): [number, number, number] {
  const hex = color.trim();
  if (hex.startsWith("#")) {
    let body = hex.slice(1);
    if (body.length === 3) {
      body = body[0] + body[0] + body[1] + body[1] + body[2] + body[2];
    }
    if (body.length >= 6) {
      const r = parseInt(body.slice(0, 2), 16) / 255;
      const g = parseInt(body.slice(2, 4), 16) / 255;
      const b = parseInt(body.slice(4, 6), 16) / 255;
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return [r, g, b];
    }
    return [0, 0, 0];
  }
  const m = hex.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
    return [
      (parts[0] ?? 0) / 255,
      (parts[1] ?? 0) / 255,
      (parts[2] ?? 0) / 255,
    ];
  }
  return [0, 0, 0];
}

/** Convert CSS color to 0–255 RGB integers for jsPDF text/fill/stroke color */
function rgb255(color: string): [number, number, number] {
  const [r, g, b] = parseColor(color);
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/** Relative luminance (WCAG) — used to pick readable on-accent text */
function luminance(color: string): number {
  const [r, g, b] = parseColor(color);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Choose white or black text for maximum readability on a background */
function readableOn(bg: string): [number, number, number] {
  return contrastRatio(bg, "#ffffff") >= 3.2 ? [255, 255, 255] : rgb255("#1a1a1a");
}

/**
 * Build a download filename base from the profile name.
 * Accented letters are TRANSLITERATED, not replaced with "_": "Dénes András"
 * must become "Denes_Andras", never "D_nes_Andr_s".
 */
function filenameBaseFromName(raw: string | undefined): string {
  const name = (raw ?? "").trim();
  if (!name) return "CV";
  const ascii = name
    // Letters NFD cannot decompose (ø, đ, ł, ß, œ, æ…) handled explicitly.
    .replace(/[ßẞ]/g, "ss")
    .replace(/[œŒ]/g, "oe")
    .replace(/[æÆ]/g, "ae")
    .replace(/[øØ]/g, "o")
    .replace(/[đĐðÐ]/g, "d")
    .replace(/[łŁ]/g, "l")
    .replace(/[þÞ]/g, "th")
    // é→e, á→a, ő→o, ű→u, ç→c, ñ→n…
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const base = ascii
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return base || "CV";
}

/** Convert px (96-DPI screen) to pt (1/72 inch): 1px = 0.75pt at 96 DPI */
function px2pt(px: number): number {
  return px * 0.75;
}

// ─── DOM strut box model (probe-verified against the live preview) ───────────
// The preview's line geometry is strut-based: every text row occupies a strut
// box and the baseline sits at strut/2 + fs×((asc−desc)/2) from the box top.
// See the cvcreator skill reference session-2026-10-07-dom-strut-parity.md.

/** Entry title font size (0.95rem). Title row strut = 15.2px × line-height
 *  preset (the unitless preset inherits into the title span). */
const TITLE_FS_PX = 15.2;
/** Org/description rows (Tailwind text-sm): FIXED 20px strut
 *  (line-height: 1.25rem) — preset-INDEPENDENT. */
const BODY_STRUT_PX = 20;
/** Below-mode description block mt-1 (4px). */
const DESC_MARGIN_PX = 4;

/** Baseline anchor (pt) inside a strut box measured from the box top —
 *  anchor = strut/2 + fs×((asc−desc)/2). `ratio` comes from the embedded
 *  webfont's canvas fontBoundingBox metrics at export time (browser) and
 *  falls back to 0.363 (Inter-like metrics) under Node/harnesses. */
function anchorPt(strutPx: number, fsPx: number, ratio: number): number {
  return px2pt(strutPx / 2 + fsPx * ratio);
}

// ─── Letter spacing (ONE owner of the preview's tracking, Step 8) ───────────
// The preview's CSS is the reference: Tailwind classes (tracking-wide 0.025em,
// tracking-wider 0.05em, tracking-widest 0.1em — tailwind v3 defaults, no
// project override) and the inline letterSpacing styles that win over them.
// jsPDF's charSpace adds Tc after every glyph (including the last), matching
// CSS's per-character spacing; charSpace_pt = em × drawn fontSize_pt, so the
// tracking scales with the auto-shrunk heading size automatically.
const TRACKING_EM = {
  /** cv-preview h1: style={{ letterSpacing: "-0.02em" }} */
  name: -0.02,
  /** cv-preview subtitle div: inline letterSpacing 0.1em (overrides its
   *  `tracking-wider` class — inline style wins). */
  subtitle: 0.1,
  /** h2 underline: `tracking-wide`. */
  headingUnderline: 0.025,
  /** h2 border: `tracking-wider`. */
  headingBorder: 0.05,
  /** h2 filled: `tracking-wider`. */
  headingFilled: 0.05,
  /** h2 minimal: inline letterSpacing 0.15em (overrides `tracking-widest`). */
  headingMinimal: 0.15,
} as const;

/** ((asc − desc) / 2) as a fraction of em, measured from canvas
 *  fontBoundingBox metrics for the given CSS font stack (browser only). */
function computeBaselineRatio(fontStackCss: string): number {
  const FALLBACK = 0.363;
  try {
    if (typeof document === "undefined") return FALLBACK;
    const c = document.createElement("canvas");
    const g = c.getContext("2d");
    if (!g) return FALLBACK;
    g.font = `400 100px ${fontStackCss}`;
    const m = g.measureText("Hx") as TextMetrics & {
      fontBoundingBoxAscent?: number;
      fontBoundingBoxDescent?: number;
    };
    const asc = m.fontBoundingBoxAscent;
    const desc = m.fontBoundingBoxDescent;
    if (!asc || !desc || asc + desc <= 0) return FALLBACK;
    return (asc - desc) / 200;
  } catch {
    return FALLBACK;
  }
}

// ─── Per-style baseline anchors (Step 8, probe-verified) ──────────────────────
//
// The preview's line boxes are laid out by the SAME engine the export runs in,
// so the exact (asc−desc)/2 the strut formula needs is MEASURABLE, per drawn
// (weight, size, strut): render one off-screen line box with the same
// font/size/line-height and read the baseline (empty inline-block bottom)
// relative to its top. This reproduces the DOM's placement exactly — measured
// on the demo CV (Inter): probe O values 26/16/20/17/12/15 px for
// name/subtitle/heading/title/year/body vs the canvas-at-100px ratio 0.365,
// which misplaces the name baseline by ~1 px. The probe is awaited through
// document.fonts.load for the exact face, so it cannot resolve the fallback
// family by accident (the old canvas measurement could, nondeterministically).
//
// Under Node (harnesses/gate) there is no DOM: the map stays empty and every
// style falls back to `baselineRatio`. scripts/capture-preview-boxes.js emits
// the probed values as `probeRatios` so the gate can reproduce the in-browser
// placement via PdfExportOptions.baselineRatios (see scripts/cv-row-parity.js
// --browser-metrics).

/** One line box the export draws — the probe identity. */
interface AnchorTriple {
  /** CSS font-weight of the face (400 | 500 | 600 | 700). */
  weight: number;
  italic: boolean;
  fsPx: number;
  strutPx: number;
}

/** Shared key format with the fixture (capture-preview-boxes.js): numbers are
 *  rounded to 2 decimals so float arithmetic cannot split a key. */
function anchorKey(t: AnchorTriple): string {
  const r2 = (n: number) => +n.toFixed(2);
  return `${t.italic ? "i" : ""}${t.weight}|${r2(t.fsPx)}|${r2(t.strutPx)}`;
}

/** Probe the engine's baseline offset O (px) for each (weight, fs, strut) —
 *  in the browser only; returns {} everywhere else. */
async function probeStyleRatios(
  fontStackCss: string,
  triples: AnchorTriple[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (typeof document === "undefined") return out;
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts?.load || !document.body) return out;
  try {
    await Promise.all(
      triples.map((t) =>
        fonts
          .load(`${t.italic ? "italic " : ""}${t.weight} ${t.fsPx}px ${fontStackCss}`)
          .catch(() => null)
      )
    );
    for (const t of triples) {
      const d = document.createElement("div");
      d.style.cssText =
        `position:fixed;left:-99999px;top:0;white-space:nowrap;` +
        `font-family:${fontStackCss};font-weight:${t.weight};` +
        `${t.italic ? "font-style:italic;" : ""}` +
        `font-size:${t.fsPx}px;line-height:${t.strutPx}px;`;
      d.appendChild(document.createTextNode("Hx"));
      const s = document.createElement("span");
      s.style.cssText = "display:inline-block;width:0;height:0;";
      d.appendChild(s);
      document.body.appendChild(d);
      const O = s.getBoundingClientRect().bottom - d.getBoundingClientRect().top;
      d.remove();
      const ratio = (O - t.strutPx / 2) / t.fsPx;
      if (Number.isFinite(ratio)) out.set(anchorKey(t), ratio);
    }
  } catch {
    // probing failed — callers fall back to baselineRatio
  }
  return out;
}

/** Wrap text within a given width using jsPDF's text wrapping */
function wrapText(doc: jsPDF, text: string, maxWidth: number): string[] {
  if (!text) return [];
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph === "") {
      lines.push("");
      continue;
    }
    const wrapped = doc.splitTextToSize(paragraph, maxWidth) as string[];
    for (const w of wrapped) lines.push(w);
  }
  return lines;
}

/** Embed the profile picture as a raster image (the only raster element). */
async function embedPhoto(
  doc: jsPDF,
  photoDataUrl: string,
  x: number,
  y: number,
  width: number,
  height: number
): Promise<void> {
  const isPng = photoDataUrl.startsWith("data:image/png");
  const format = isPng ? "PNG" : "JPEG";
  try {
    doc.addImage(photoDataUrl, format, x, y, width, height, undefined, "FAST");
  } catch {
    doc.setFillColor(0.9, 0.9, 0.9);
    doc.rect(x, y, width, height, "F");
  }
}

/** Draw a rounded rect. Falls back to sharp rect if jsPDF lacks roundedRect. */
function roundedRect(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  style: "S" | "F" | "FD" = "S"
): void {
  if (r <= 0.1) {
    doc.rect(x, y, w, h, style);
    return;
  }
  r = Math.min(r, w / 2, h / 2);
  try {
    doc.roundedRect(x, y, w, h, r, r, style);
  } catch {
    doc.rect(x, y, w, h, style);
  }
}

// ─── Render context ────────────────────────────────────────────────────────────

interface RenderContext {
  doc: jsPDF;
  palette: ColorPalette;
  template: TemplateConfig;
  spacing: { section: number; item: number; lineHeight: number };
  borderRadius: number;
  pageMargin: number; // in pt
  accent: string;
  primary: string;
  subtitle: string;
  pageMarginColor: string;
  contentBgColor: string;
  textColor: string;
  mutedColor: string;
  profileRim: boolean;
  profileRadius: number;
  profileImagePosition: string;
  activeLang: string;
  contentWidth: number; // in pt
  /** Content-box height in pt (px2pt of cv-flow-layout's contentBoxHeightPx)
   *  — the top-anchored bound of the flow, and the TOP of the bottom
   *  margin band where the end-of-CV contact block draws. */
  contentHeightPt: number;
  pageHeightPt: number;
  pageWidthPt: number;
  fontFam: string; // "helvetica" or "times" (built-in fallback)
  fontStyles?: Record<FontStyle, string>; // embedded per-style families
  embedded: boolean;
  /** (asc−desc)/2 em fraction of the active webfont (canvas-measured in the
   *  browser; 0.363 fallback) — drives the strut baseline anchors below. */
  baselineRatio: number;
  /** Per-style baseline ratios (browser-probed / harness-injected, see
   *  probeStyleRatios). A missing key falls back to `baselineRatio`. */
  styleRatios?: Map<string, number>;
  /** Description placement: "below" (own line) or "inline" (after title/org) */
  inlineDesc: boolean;
  /** Separator used in inline placement ("—", ":", "·", "•", "|") */
  descSeparator: string;
}

// ─── Effective colors (custom overrides win over palette) ────────────────────

interface EffectiveColors {
  primary: string;
  accent: string;
  bg: string;
  contentBg: string;
  surface: string;
  text: string;
  muted: string;
  subtitle: string;
}

function resolveColors(design: Partial<CVDesign>, palette: ColorPalette): EffectiveColors {
  const cfg = (design.custom_config ?? {}) as Record<string, unknown>;
  return {
    primary: design.primary_color || palette.primary,
    accent: design.accent_color || palette.accent,
    bg: (cfg.marginColor as string) || palette.bg,
    // Content-area background behind the text (defaults to white)
    contentBg: (cfg.contentBgColor as string) || "#ffffff",
    surface: (cfg.surfaceColor as string) || palette.surface,
    text: (cfg.textColor as string) || palette.text,
    muted: (cfg.mutedColor as string) || palette.muted,
    subtitle: (cfg.subtitleColor as string) || design.accent_color || palette.accent,
  };
}

// ─── Render functions ──────────────────────────────────────────────────────────

function setFill(ctx: RenderContext, color: string): void {
  const [r, g, b] = rgb255(color);
  ctx.doc.setFillColor(r, g, b);
}

/** Indent (pt) of an entry's continuation lines (wrapped description
 * remainder / organization row) — keeps a 2nd visual row from reading as
 * a new item. px2pt(10) matches the preview's CONT_INDENT_PX. */
const CONT_INDENT_PT = px2pt(10);

function setStroke(ctx: RenderContext, color: string): void {
  const [r, g, b] = rgb255(color);
  ctx.doc.setDrawColor(r, g, b);
}

function setText(ctx: RenderContext, color: string): void {
  const [r, g, b] = rgb255(color);
  ctx.doc.setTextColor(r, g, b);
}

/** Built-in jsPDF families only ship normal/bold/italic/bolditalic — map the
 * preview's 500/600 logical styles onto the closest built-in face (same rule
 * as the embedded resolution chain above: 500→400, 600→700). */
const BUILTIN_STYLE: Record<FontStyle, string> = {
  normal: "normal",
  bold: "bold",
  italic: "italic",
  bolditalic: "bolditalic",
  medium: "normal",
  semibold: "bold",
};

function setFont(ctx: RenderContext, style: FontStyle, sizePt: number): void {
  const fam = ctx.embedded ? ctx.fontStyles?.[style] : undefined;
  if (fam) {
    // Unique per-style families are registered with the single "normal" style.
    ctx.doc.setFont(fam, "normal");
  } else {
    ctx.doc.setFont(ctx.fontFam, BUILTIN_STYLE[style] ?? style);
  }
  ctx.doc.setFontSize(sizePt);
}

/** The strut-formula ratio for one drawn line box: the per-style probed value
 *  when available (browser / harness-injected), else the single fallback. */
function styleRatio(
  ctx: RenderContext,
  t: AnchorTriple
): number {
  return ctx.styleRatios?.get(anchorKey(t)) ?? ctx.baselineRatio;
}

function drawPageBackground(ctx: RenderContext): void {
  // 1) Fill the whole page with the margin color...
  setFill(ctx, ctx.pageMarginColor);
  ctx.doc.rect(0, 0, ctx.pageWidthPt, ctx.pageHeightPt, "F");
  // 2) ...then the inner content box with the (distinct) content background,
  //    so the margin ring keeps its own color around the text area.
  setFill(ctx, ctx.contentBgColor);
  ctx.doc.rect(
    ctx.pageMargin,
    ctx.pageMargin,
    ctx.pageWidthPt - ctx.pageMargin * 2,
    ctx.pageHeightPt - ctx.pageMargin * 2,
    "F"
  );
}

/**
 * Render a section heading. y = BLOCK TOP of the heading (DOM box semantics —
 * the flow cursor always points at the next item's box top, never a baseline).
 *
 * Line geometry mirrors the preview's h2: Tailwind preflight sets
 * `html { line-height: 1.5 }` and h2 { font-size: inherit } — no style sets a
 * line-height on h2, so the strut = fontSize × 1.5 and is PRESET-independent
 * (the entry line-height preset never reaches section headings).
 * Strut box model: baseline = blockTop + strut/2 + fs×((asc−desc)/2).
 */
function renderHeading(
  ctx: RenderContext,
  title: string,
  y: number,
  fontSizePt: number
): void {
  const { doc, template, accent, primary, borderRadius, pageMargin, contentWidth } = ctx;
  const text = title.toUpperCase();

  // Font size (auto-shrunk or base) comes from the shared flow plan — the
  // same measured size cv-flow-layout computed the heading block's box
  // with, so the drawn heading and the paginated model cannot drift.
  const fontSize = fontSizePt;
  // Heading strut in px (fs × 1.5 from preflight) — scales with auto-shrink.
  const fsPx = fontSize / 0.75;
  const strutPx = fsPx * 1.5;
  // Preview's weight + tracking per style: `tracking-wide/wider` classes and
  // the minimal style's inline 0.15em (TRACKING_EM is the ONE owner); the
  // minimal h2 is `font-semibold` (600), all others `font-bold` (700).
  const isMinimal = template.headingStyle === "minimal";
  const headingFont: FontStyle = isMinimal ? "semibold" : "bold";
  const headingWeight = isMinimal ? 600 : 700;
  const trackingEm = isMinimal
    ? TRACKING_EM.headingMinimal
    : template.headingStyle === "underline"
      ? TRACKING_EM.headingUnderline
      : template.headingStyle === "filled"
        ? TRACKING_EM.headingFilled
        : TRACKING_EM.headingBorder;
  // charSpace is in pt and scales with the drawn size: em × fs_pt.
  const charSpace = trackingEm * fontSize;
  const baselineOff = anchorPt(
    strutPx,
    fsPx,
    styleRatio(ctx, { weight: headingWeight, italic: false, fsPx, strutPx })
  );

  switch (template.headingStyle) {
    case "underline": {
      setFont(ctx, headingFont, fontSize);
      setText(ctx, primary);
      doc.text(text, pageMargin, y + baselineOff, { charSpace });
      setStroke(ctx, accent);
      doc.setLineWidth(1.5);
      // borderBottom sits below paddingBottom 4px → strut + 4px.
      doc.line(pageMargin, y + px2pt(strutPx + 4), pageMargin + contentWidth, y + px2pt(strutPx + 4));
      doc.setLineWidth(0.2);
      // Box: strut + paddingBottom 4 + border 2. The mb-3 gap and the rest
      // of the flow come from the shared plan (block.gapAfterPx).
      break;
    }
    case "border": {
      setFont(ctx, headingFont, fontSize);
      setText(ctx, primary);
      setStroke(ctx, accent);
      doc.setLineWidth(2.25);
      // borderLeft spans the h2's full content box (strut height).
      doc.line(pageMargin, y, pageMargin, y + px2pt(strutPx));
      doc.setLineWidth(0.2);
      doc.text(text, pageMargin + px2pt(13), y + baselineOff, { charSpace }); // border 3px + padding 10px
      break;
    }
    case "filled": {
      setFont(ctx, headingFont, fontSize);
      // getTextWidth excludes charSpace — the box must cover the tracked
      // width too (every glyph advances by Tc, including the last).
      const textWidth =
        doc.getTextWidth(text) + charSpace * text.length;
      const padX = px2pt(12); // px-3
      const padYpx = 6;       // py-1.5
      const boxW = textWidth + padX * 2;
      const boxH = px2pt(strutPx + padYpx * 2);
      setFill(ctx, accent);
      roundedRect(doc, pageMargin, y, boxW, boxH, borderRadius, "F");
      const [wr, wg, wb] = readableOn(accent);
      doc.setTextColor(wr, wg, wb);
      doc.text(text, pageMargin + padX, y + px2pt(padYpx) + baselineOff, { charSpace });
      break;
    }
    case "minimal": {
      // fs 16px base → strut 24px (16 × 1.5); mb-2 = 8px.
      setFont(ctx, headingFont, fontSize);
      setText(ctx, primary);
      doc.text(text, pageMargin, y + baselineOff, { charSpace });
      break;
    }
    default: {
      // Bare preflight h2: inherits 14px, strut 21px, no margin (dead code
      // for all shipped templates — every template sets a headingStyle).
      setFont(ctx, "bold", fontSize);
      setText(ctx, primary);
      doc.text(text, pageMargin, y + anchorPt(21, 14, ctx.baselineRatio));
      break;
    }
  }
}

/**
 * Render one entry. y = BLOCK TOP of the entry (DOM box semantics — the flow
 * cursor always points at the next item's top edge, never a baseline).
 *
 * Strut box model (probe-verified, see skill ref dom-strut-parity):
 * - Title rows strut = 15.2px × line-height preset (unitless preset inherits
 *   into the title span).
 * - Org/desc rows (Tailwind text-sm) strut = 20px FIXED — preset-independent.
 * - Inline mode (desc nested in the title span): strut = max(20, 15.2×P).
 * - Baseline inside a strut = strut/2 + fs×((asc−desc)/2) from the box top.
 * - Below-mode desc block adds mt-1 (4px) before its strut box.
 * jsPDF array rows step EXACTLY fontSize × lineHeightFactor, so each array
 * passes factor = strutPt/arrayFontSizePt and the first baseline is placed at
 * boxTop + anchor.
 */
function renderEntry(
  ctx: RenderContext,
  entry: SectionWithEntries["entries"][0],
  y: number
): number {
  const { doc, primary, spacing, activeLang, pageMargin, contentWidth } = ctx;
  const translation = entry.translations.find((t) => t.language === activeLang);
  const title = sanitizeText(translation?.title ?? "");
  const organization = sanitizeText(translation?.organization ?? "");
  const description = sanitizeText(translation?.description ?? "");
  const year = entry.year;

  const titleFsPt = px2pt(TITLE_FS_PX); // 11.4pt (0.95rem)
  const bodyFsPt = px2pt(14);          // 10.5pt (text-sm)
  const yearFsPt = px2pt(12);          // 9pt (text-xs)

  // Strut heights (pt) per row type.
  const P = spacing.lineHeight;
  const strutTpx = TITLE_FS_PX * P;                   // title strut in px
  const strutTpt = px2pt(strutTpx);                   // title rows
  const strutBpt = px2pt(BODY_STRUT_PX);              // org/desc rows (fixed 20px)
  const bodyFactor = strutBpt / bodyFsPt;             // jsPDF array leading = 20px/14px
  // Preview row weights: the title span is `font-semibold` (600), org/desc
  // are `text-sm italic` (400 italic) — the anchors must use each style's
  // own engine metrics (styleRatio).
  const anchorT = anchorPt(
    strutTpx,
    TITLE_FS_PX,
    styleRatio(ctx, { weight: 600, italic: false, fsPx: TITLE_FS_PX, strutPx: strutTpx })
  );
  const anchorB = anchorPt(
    BODY_STRUT_PX,
    14,
    styleRatio(ctx, { weight: 400, italic: true, fsPx: 14, strutPx: BODY_STRUT_PX })
  );

  // Free-text year (e.g. "2017-2021") wins over the int year column
  const yearText = sanitizeText(
    (((entry.data as { year_text?: string } | undefined)?.year_text ?? "") as string) ||
    (year != null && year !== 0 ? String(year) : "")
  );

  // Flow cursor: top edge of the NEXT row box (chain of strut sums).
  let top = y;

  if (title) {
    // Year reserves right-edge width in BOTH placements (it sits on the
    // baseline row of the title). jsPDF's getTextWidth scales with the
    // ACTIVE font size — set the title font first so render and model
    // measure the same reserve (measureEntry's convention).
    setFont(ctx, "semibold", titleFsPt);
    const yearW = yearText ? doc.getTextWidth(yearText) + px2pt(12) : 0;

    if (ctx.inlineDesc && description) {
      // Inline placement: description starts on the SAME line as the title
      // (mirrors the preview's nested span sharing one line box). Every
      // combo line struts at max(20, 15.2×P) px; the strut owner for the
      // baseline anchor is the title span when its strut wins, else the
      // text-sm desc span (14px).
      const combo = `${title} ${ctx.descSeparator} ${description}`;
      const sepW = doc.getTextWidth(` ${ctx.descSeparator} `);
      setFont(ctx, "semibold", titleFsPt);
      const titleW = doc.getTextWidth(title);
      setFont(ctx, "italic", bodyFsPt);
      const comboLines = wrapText(doc, combo, contentWidth - yearW);
      const strutIpx = Math.max(BODY_STRUT_PX, TITLE_FS_PX * P);
      const strutIpt = px2pt(strutIpx);
      const factorI = strutIpt / bodyFsPt;
      const anchorOwnerFs = strutTpx >= BODY_STRUT_PX ? TITLE_FS_PX : 14;
      const anchorI = anchorPt(
        strutIpx,
        anchorOwnerFs,
        styleRatio(ctx, {
          weight: anchorOwnerFs === TITLE_FS_PX ? 600 : 400,
          italic: anchorOwnerFs === 14,
          fsPx: anchorOwnerFs,
          strutPx: strutIpx,
        })
      );
      const wrapped = comboLines.length > 1;

      // Line 0: title + separator + description tail, baseline = top + anchor.
      setFont(ctx, "semibold", titleFsPt);
      setText(ctx, primary);
      doc.text(title, pageMargin, top + anchorI);
      setFont(ctx, "italic", bodyFsPt);
      setText(ctx, ctx.textColor);
      doc.text(` ${ctx.descSeparator} `, pageMargin + titleW, top + anchorI);
      if (!wrapped) {
        const descOnFirst = doc.splitTextToSize(description, contentWidth - yearW - sepW - titleW) as string[];
        doc.text(descOnFirst[0] ?? "", pageMargin + titleW + sepW, top + anchorI);
      } else {
        // First line carries as much description as fits after the separator:
        // comboLines[0] is `title sep descTail…` from the greedy wrap — redraw
        // only the desc tail after the separator. Remainder lines strut at
        // strutIpx and sit CONT_INDENT_PT in (continuation indent).
        const tail = comboLines[0].slice(title.length + ` ${ctx.descSeparator} `.length);
        if (tail) doc.text(tail, pageMargin + titleW + sepW, top + anchorI);
        doc.text(comboLines.slice(1), pageMargin + CONT_INDENT_PT, top + anchorI + strutIpt, { lineHeightFactor: factorI });
      }

      if (yearText) {
        setFont(ctx, "medium", yearFsPt);
        setText(ctx, ctx.mutedColor);
        doc.text(yearText, pageMargin + contentWidth, top + anchorI, { align: "right" });
      }

      top += comboLines.length * strutIpt;
    } else {
      setFont(ctx, "semibold", titleFsPt);
      setText(ctx, primary);
      const titleMaxWidth = contentWidth - yearW;
      const titleLines = doc.splitTextToSize(title, titleMaxWidth) as string[];
      // Array leading = the preset itself: strut(15.2×P px) / fs(15.2px) = P.
      doc.text(titleLines, pageMargin, top + anchorT, { lineHeightFactor: P });

      if (yearText) {
        setFont(ctx, "medium", yearFsPt);
        setText(ctx, ctx.mutedColor);
        // Baseline-aligned in the title row (items-baseline in the preview).
        doc.text(yearText, pageMargin + contentWidth, top + anchorT, { align: "right" });
      }

      top += titleLines.length * strutTpt;
    }
  }

  if (organization) {
    setFont(ctx, "italic", bodyFsPt);
    setText(ctx, ctx.mutedColor);
    const orgLines = doc.splitTextToSize(organization, contentWidth - CONT_INDENT_PT) as string[];
    // Org block top follows the title/combo lines' struts exactly (the DOM's
    // line boxes chain block-tops through strut sums). 20px fixed struts.
    // Drawn in BOTH placements — the preview's org div renders regardless of
    // descriptionPlacement (cv-preview renderEntry has no inline guard).
    doc.text(orgLines, pageMargin + CONT_INDENT_PT, top + anchorB, { lineHeightFactor: bodyFactor });
    top += orgLines.length * strutBpt;
  }

  if (description && !ctx.inlineDesc) {
    setFont(ctx, "italic", bodyFsPt);
    setText(ctx, ctx.textColor);
    const descLines = wrapText(doc, description, contentWidth - CONT_INDENT_PT);
    // mt-1 (4px) sits between the org/title rows and the desc strut boxes.
    const descTop = top + px2pt(DESC_MARGIN_PX);
    doc.text(descLines, pageMargin + CONT_INDENT_PT, descTop + anchorB, { lineHeightFactor: bodyFactor });
    top = descTop + descLines.length * strutBpt;
  } else if (description && !title) {
    // No-title fallback for inline placement: draw the description as a
    // plain indented block (line 1's separator only exists with a title).
    setFont(ctx, "italic", bodyFsPt);
    setText(ctx, ctx.textColor);
    const descLines = wrapText(doc, description, contentWidth - CONT_INDENT_PT);
    doc.text(descLines, pageMargin + CONT_INDENT_PT, top + anchorB, { lineHeightFactor: bodyFactor });
    top += descLines.length * strutBpt;
  }

  // Returns the next row-block top INSIDE the entry: the ink-box advance
  // only — every trailing gap belongs to the shared cv-flow-layout plan
  // (block.gapAfterPx), never to this renderer.
  return top;
}

// ─── Profile header wrap (card t_a8f48654) ───────────────────────────────────

/** The preview's flex gap-4 between the 96px photo and the text column. */
const PHOTO_GAP_PX = 16;

/** Wrap the profile header's name/title EXACTLY as the painter draws them.
 *
 * The preview's header divs are normal flow: a long name h1 or title div
 * WRAPS at the column width (letter-spacing included, per CSS). The
 * exporter used to draw each as ONE unbounded doc.text() run, so a long
 * header's ink ran off the page — and every real reader (poppler, print)
 * silently drops ink outside the MediaBox, which is how "PDF drops
 * extended-Latin characters" actually manifests (jsPDF's serialization is
 * complete: scripts/cv-glyph-repro.js proves it across jspdf 2.5.2→4.2.1).
 *
 * WHY NOT splitTextToSize: for embedded TTFs jsPDF's splitTextToSize drops
 * the options.charSpace you hand it (its newOptions builds {widths,
 * kerning} from metadata.Unicode and never carries charSpace through), yet
 * the draw adds Tc to EVERY glyph — so a split at the raw width overflows
 * by n × Tc per line. Measured on this tree: a line wrapped at 523.27 pt
 * drew 605 pt wide (centred −4.6..600 pt on the 595.28 pt page) and poppler
 * dropped its final glyph. The wrap below budgets the tracking the way the
 * draw spends it — jsPDF's own width model INCLUDING charSpace
 * (getStringUnitWidth → TTFFont.widthOfString adds Tc per glyph), the same
 * model align:"center" centres with. That is also what the preview's CSS
 * letter-spacing does to the browser's wrap.
 *
 * ONE owner of the line counts: BOTH the flow measurement
 * (makeMeasure.headerBoxPx → headerTextStrutsBoxPx) and the painter call
 * this, so the planned header box and the drawn ink can never disagree —
 * for single-line headers the draw is character-for-character the old
 * call (the loop runs once on the full string).
 */
function headerWrapLines(
  doc: jsPDF,
  name: string,
  title: string,
  wrapWidthPt: number,
  setFontFor: (style: FontStyle, sizePt: number) => void
): { nameLines: string[]; titleLines: string[] } {
  // Greedy word wrap against the drawn width (glyph + charSpace per glyph,
  // the centre math's own model). A word longer than the budget stays on
  // its own overflowing line — the browser behaves the same for an
  // unbreakable word.
  const wrapTracked = (text: string, fsPt: number, charSpacePt: number): string[] => {
    const maxUnits = wrapWidthPt / fsPt;
    const width = (s: string) => doc.getStringUnitWidth(s, { charSpace: charSpacePt });
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const word of words) {
      const candidate = cur ? `${cur} ${word}` : word;
      if (!cur || width(candidate) <= maxUnits) cur = candidate;
      else {
        lines.push(cur);
        cur = word;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  let nameLines: string[] = [];
  let titleLines: string[] = [];
  if (name) {
    setFontFor("bold", px2pt(28)); // 1.75rem
    nameLines = wrapTracked(name, px2pt(28), TRACKING_EM.name * px2pt(28));
  }
  if (title) {
    setFontFor("medium", px2pt(14)); // 0.875rem, fontWeight 500
    titleLines = wrapTracked(title.toUpperCase(), px2pt(14), TRACKING_EM.subtitle * px2pt(14));
  }
  return { nameLines, titleLines };
}

async function renderProfileHeader(
  ctx: RenderContext,
  data: PdfCVData
): Promise<number> {
  const { doc, accent, primary, pageMargin, contentWidth } = ctx;
  const name = sanitizeText(data.profileName);
  const title = sanitizeText(data.profileTitle);
  if (!name && !title && !data.profilePicture) return pageMargin;

  let y = pageMargin;
  const isRight = ctx.profileImagePosition === "right";
  const photoSize = px2pt(96);

  if (data.profilePicture) {
    const photoX = isRight
      ? pageMargin + contentWidth - photoSize
      : pageMargin;
    const textX = isRight
      ? pageMargin
      : pageMargin + photoSize + px2pt(PHOTO_GAP_PX); // gap-4

    if (ctx.profileRim) {
      setStroke(ctx, accent);
      doc.setLineWidth(1.5);
      doc.rect(photoX - 1.5, y - 1.5, photoSize + 3, photoSize + 3, "S");
      doc.setLineWidth(0.2);
    }

    await embedPhoto(doc, data.profilePicture, photoX, y, photoSize, photoSize);

    // The preview's flex text column (flex: 1 beside the 96px photo + gap-4)
    // WRAPS a long name/title at the column width; the exporter used to draw
    // each as ONE unbounded run, whose ink ran off the page (card
    // t_a8f48654). Same wrap, one doc.text() per line, per-line strut
    // advance — a single-line header draws exactly the old call.
    const textWrapW = contentWidth - photoSize - px2pt(PHOTO_GAP_PX);
    const { nameLines, titleLines } = headerWrapLines(doc, name, title, textWrapW, (s, pt) =>
      setFont(ctx, s, pt)
    );

    if (nameLines.length) {
      setFont(ctx, "bold", px2pt(28)); // 1.75rem
      setText(ctx, primary);
      // Top-aligned with the photo (mirrors the preview's items-start):
      // line 0's baseline sits one ascent (21pt × ~0.79) below the photo
      // top — no vertical-centering offset, no extra line; every further
      // line advances by the h1 strut (33.6 px). The h1's CSS letter-spacing
      // −0.02em applies here too (TRACKING_EM.name).
      const charSpace = TRACKING_EM.name * px2pt(28);
      for (let i = 0; i < nameLines.length; i++) {
        doc.text(nameLines[i], textX, y + 16.5 + i * px2pt(NAME_STRUT_PX), { charSpace });
      }
    }

    if (titleLines.length) {
      setFont(ctx, "medium", px2pt(14));
      setText(ctx, ctx.subtitle);
      // Directly under the LAST name line with the 4px margin from the
      // preview (single-line name: ascent 16.5 + 3pt margin + title ascent ≈
      // 27.5); with no name the title takes the top slot at its own ascent
      // (~10.5). The subtitle div: fontWeight 500 + letterSpacing 0.1em
      // (preview CSS); every further line advances by the div strut (21 px).
      const lastNameBaseline = nameLines.length
        ? y + 16.5 + (nameLines.length - 1) * px2pt(NAME_STRUT_PX)
        : null;
      const titleY = lastNameBaseline != null ? lastNameBaseline + 11 : y + 10.5;
      const charSpace = TRACKING_EM.subtitle * px2pt(14);
      for (let i = 0; i < titleLines.length; i++) {
        doc.text(titleLines[i], textX, titleY + i * px2pt(HEADER_TITLE_STRUT_PX), { charSpace });
      }
    }

    // The header's advance (photo box + ONE section gap) is the shared
    // plan's header block — this renderer only paints; the walk positions
    // the next block from the plan.
    return y;
  }

  // No-photo branch: strut box model (the shared plan's header block owns
  // the advance — 33.6 + 4 + 21 px box per line pair + ONE section gap).
  // Name h1: 28px, lh 1.2 → strut 33.6px, mb 4px, letterSpacing −0.02em;
  // title div: 14px fontWeight 500, letterSpacing 0.1em, strut 21px
  // (preflight). Baseline anchors mirror the DOM struts via each style's
  // own probed engine metrics; TOP-aligned blocks via strut sums. A long
  // name/title WRAPS at the content width (one centred doc.text() per
  // line, per-line strut advance — card t_a8f48654); a single-line header
  // draws exactly the old call.
  const { nameLines, titleLines } = headerWrapLines(doc, name, title, contentWidth, (s, pt) =>
    setFont(ctx, s, pt)
  );
  if (nameLines.length) {
    setFont(ctx, "bold", px2pt(28)); // 1.75rem
    setText(ctx, primary);
    const anchor = anchorPt(33.6, 28, styleRatio(ctx, { weight: 700, italic: false, fsPx: 28, strutPx: 33.6 }));
    const charSpace = TRACKING_EM.name * px2pt(28);
    for (let i = 0; i < nameLines.length; i++) {
      doc.text(nameLines[i], pageMargin + contentWidth / 2, y + anchor + i * px2pt(NAME_STRUT_PX), {
        align: "center",
        charSpace,
      });
    }
  }
  if (titleLines.length) {
    setFont(ctx, "medium", px2pt(14));
    setText(ctx, ctx.subtitle);
    // Title block top = ALL the name struts + mb-4px (0 with no name).
    const titleTop = y + px2pt(nameLines.length * NAME_STRUT_PX + (nameLines.length ? NAME_MARGIN_PX : 0));
    const anchor = anchorPt(HEADER_TITLE_STRUT_PX, 14, styleRatio(ctx, { weight: 500, italic: false, fsPx: 14, strutPx: HEADER_TITLE_STRUT_PX }));
    const charSpace = TRACKING_EM.subtitle * px2pt(14);
    for (let i = 0; i < titleLines.length; i++) {
      doc.text(titleLines[i], pageMargin + contentWidth / 2, titleTop + anchor + i * px2pt(HEADER_TITLE_STRUT_PX), {
        align: "center",
        charSpace,
      });
    }
  }
  // No divider, no second section gap: the preview's no-photo header is the
  // text block + ONE marginBottom: spacing.section — its intended divider is
  // a zero-width flex child that never paints (pixel-verified,
  // .plan/cv-parity/REPORT.md §3: the PDF's y=126 hairline had no preview
  // counterpart). The advance (text-block box + ONE section gap) is the
  // shared plan's header block — render and pagination cannot drift.
  return y;
}

// ─── End-of-CV contact block (bottom margin band, OUTSIDE the flow) ──────────

/**
 * Render the end-of-CV contact block (phone / e-mail) in the BOTTOM MARGIN
 * BAND of the doc's CURRENT page — outside the flow by construction: it is
 * never part of the shared plan, never added to any flow height, and cannot
 * shift a row or trigger a page break. Geometry mirrors the preview's
 * absolutely-positioned band block exactly (cv-preview.tsx):
 *   - band top = the content box BOTTOM (pageMargin + content-box height):
 *     the same top-anchored px2pt chain every flow row uses. NOT
 *     pageHeightPt − pageMargin — that differs by the A4 rounding
 *     (1123 px → 842.25 pt vs the real 841.89 pt page ≈ 0.5 px) and would
 *     land the band off the preview grid.
 *   - the block is vertically centred in the pageMargin-tall band
 *     (offset from the band top, computed from the enabled line count —
 *     the preview computes the identical offset).
 *   - 12 px rows at single line-height (CONTACT_LINE_PX), phone above
 *     e-mail, muted colour, no tracking.
 *   - horizontally aligned like the profile header: centred when the
 *     header renders without a photo, left with one (centerX).
 * The baseline anchor is the same strut formula as every other row —
 * anchor triple 400|12|12, probed per style in the browser (probeStyleRatios)
 * so the in-browser export places the band baselines exactly where the DOM
 * puts them.
 */
function renderContactBlock(
  ctx: RenderContext,
  lines: ContactLine[],
  marginPx: number,
  centerX: boolean
): void {
  const { doc } = ctx;
  const fsPx = CONTACT_LINE_PX;
  const strutPx = CONTACT_LINE_PX; // single line-height
  const fsPt = px2pt(fsPx);
  const strutPt = px2pt(strutPx);
  const anchor = anchorPt(
    strutPx,
    fsPx,
    styleRatio(ctx, { weight: 400, italic: false, fsPx, strutPx })
  );
  const bandTopPt = ctx.pageMargin + ctx.contentHeightPt;
  const blockHPx = lines.length * strutPx;
  const topPt = bandTopPt + px2pt(Math.max(0, (marginPx - blockHPx) / 2));
  setFont(ctx, "normal", fsPt);
  setText(ctx, ctx.mutedColor);
  const x = centerX ? ctx.pageMargin + ctx.contentWidth / 2 : ctx.pageMargin;
  let yPt = topPt;
  for (const l of lines) {
    // Wrap at the content box width like the preview's block div (width =
    // content box): a pathological value wraps DOWN from the same anchor,
    // so the first line's top keeps its parity for any input.
    const segs = wrapText(doc, l.text, ctx.contentWidth);
    for (const seg of segs) {
      doc.text(seg, x, yPt + anchor, centerX ? { align: "center" } : undefined);
      yPt += strutPt;
    }
  }
}


// ─── Shared flow plan: measurement + painting ──────────────────────────────────
//
// src/lib/cv-flow-layout.ts owns the flow structure, the gap arithmetic, the
// heading/header box constants and the pagination rules. What stays here is
// per-engine ONLY: measuring entry ink boxes and heading font sizes with
// jsPDF's embedded fonts (the strut row model — see the constants above and
// the cvcreator skill's dom-strut-parity reference), and painting the placed
// plan through px2pt().

/** Everything exportToPdf and the harnesses need to measure flow text with
 *  jsPDF exactly the way the renderer draws it (same fonts, sizes, wrap
 *  widths). */
export interface PdfMeasureSetup {
  fontStyles?: Record<FontStyle, string>;
  embedded: boolean;
  fontFam: string;
  /** The CSS font stack of the CV's font (design-constants getFontStack) —
   *  the exporter probes per-style baseline anchors with it. */
  fontStack: string;
  baselineRatio: number;
  /** Per-language FlowMeasure (strut sums × jsPDF wrap counts, CSS px). */
  makeMeasure(activeLang: string): FlowMeasure;
}

export async function setupPdfMeasure(
  doc: jsPDF,
  design: Partial<CVDesign>
): Promise<PdfMeasureSetup> {
  const template = getTemplate(design.template ?? "clean");
  const fontValue = design.font_family ?? template.defaultFont;
  const fontStack = getFontStack(fontValue);
  const serifKeywords = ["serif", "Georgia", "Garamond", "Lora", "Merriweather", "Crimson", "Playfair"];
  const fontFam = serifKeywords.some((kw) => fontStack.includes(kw))
    ? "times"
    : "helvetica";
  const spacing = {
    ...SPACING_VALUES[design.spacing ?? "normal"],
    // User line-height preset overrides the spacing preset's default
    lineHeight: getLineHeightValue(design, design.spacing ?? "normal"),
  };
  const cfg = (design.custom_config ?? {}) as Record<string, unknown>;
  const inlineDesc = ((cfg.descriptionPlacement as string) ?? "below") === "inline";
  const descSeparator = ((cfg.descriptionSeparator as string) ?? "—") || "—";

  // Fonts: try to embed the real typeface (vector TTF from the Fontsource
  // build in /public/fonts/cv, cached by the browser after first export);
  // fall back to jsPDF's built-ins when unavailable.
  let fontStyles: Record<FontStyle, string> | undefined;
  let embedded = false;
  try {
    const registration = await registerFontFamily(doc, fontValue);
    if (registration) {
      fontStyles = registration.styleFam;
      embedded = registration.hasItalic;
    }
  } catch {
    // CDN unreachable / offline — built-ins still produce a clean PDF
  }

  // Baseline anchor ratio for the strut model: measure the real webfont's
  // fontBoundingBox metrics when a canvas exists (browser), fall back to
  // the Inter-like 0.363 under Node/harnesses.
  const baselineRatio = computeBaselineRatio(fontStack);

  const makeMeasure = (activeLang: string): FlowMeasure => {
    const setMFont = (style: FontStyle, sizePt: number): void => {
      const fam = embedded ? fontStyles?.[style] : undefined;
      if (fam) {
        // Unique per-style families are registered with the single
        // "normal" style (see registerFontFamily).
        doc.setFont(fam, "normal");
      } else {
        doc.setFont(fontFam, style);
      }
      doc.setFontSize(sizePt);
    };
    return {
      // Strut sums × wrap counts — the exporter's model of the DOM entry
      // box (probe-verified: title rows 15.2×preset, org/desc rows 20px
      // FIXED, inline combo max(20, 15.2×preset), desc mt-1 4px). NO gap
      // arithmetic here — cv-flow-layout owns every gap.
      entryBoxPx(entry, widthPx) {
        const widthPt = px2pt(widthPx);
        const translation = entry.translations.find(
          (t) => t.language === activeLang
        );
        const title = sanitizeText(translation?.title ?? "");
        const organization = sanitizeText(translation?.organization ?? "");
        const description = sanitizeText(translation?.description ?? "");
        const P = spacing.lineHeight;
        const strutTpx = TITLE_FS_PX * P;
        let box = 0;
        if (title) {
          setMFont("semibold", px2pt(TITLE_FS_PX));
          // Free-text year (e.g. "2017-2021") wins over the int year
          // column; the year reserves right-edge width like the renderer.
          const yearText = sanitizeText(
            (((entry.data as { year_text?: string } | undefined)?.year_text ?? "") as string) ||
              (entry.year != null && entry.year !== 0 ? String(entry.year) : "")
          );
          const yearW = yearText ? doc.getTextWidth(yearText) + px2pt(12) : 0;

          if (inlineDesc && description) {
            // Inline placement: combo wraps at width − yearW; every combo
            // line struts at max(20, 15.2×P) px (the nested desc span raises
            // the line box — DOM-verified).
            const combo = `${title} ${descSeparator} ${description}`;
            setMFont("italic", px2pt(14));
            const comboLines = wrapText(doc, combo, Math.max(60, widthPt - yearW));
            box += comboLines.length * Math.max(BODY_STRUT_PX, TITLE_FS_PX * P);
          } else {
            const lines = doc.splitTextToSize(
              title,
              Math.max(40, widthPt - yearW)
            ) as string[];
            box += lines.length * strutTpx;
          }
        } else if (inlineDesc && description) {
          // No title but inline description: a plain wrapped block at the
          // (indented) width.
          setMFont("italic", px2pt(14));
          const lines = wrapText(doc, description, Math.max(40, widthPt - CONT_INDENT_PT));
          box += lines.length * BODY_STRUT_PX;
        }
        if (organization) {
          // Continuation row: measured at the INDENTED width (renderEntry
          // draws org lines at x + CONT_INDENT_PT). Rendered in BOTH
          // placements — the preview always renders the org div.
          setMFont("italic", px2pt(14));
          const lines = doc.splitTextToSize(
            organization,
            Math.max(40, widthPt - CONT_INDENT_PT)
          ) as string[];
          box += lines.length * BODY_STRUT_PX;
        }
        if (description && !inlineDesc) {
          // mt-1 (4px) + 20px struts — text-sm's strut is preset-INDEPENDENT.
          setMFont("italic", px2pt(14));
          const lines = wrapText(doc, description, Math.max(40, widthPt - CONT_INDENT_PT));
          box += DESC_MARGIN_PX + lines.length * BODY_STRUT_PX;
        }
        return box;
      },
      // Auto-shrink rule (the old renderHeading's fitPt, verbatim): measure
      // the uppercased title with the BUILT-IN bold face and shrink when it
      // would overflow the content box minus the style's horizontal chrome.
      // Returns CSS px; cv-flow-layout turns the size into the heading box.
      headingFontSizePx(title, basePx, padPx) {
        const basePt = px2pt(basePx);
        if (!title) return basePx;
        doc.setFont(fontFam, "bold");
        doc.setFontSize(basePt);
        const sizeRatio = doc.getTextWidth(title.toUpperCase()) / (basePt || 1);
        const avail = px2pt(contentBoxWidthPx(design)) - px2pt(padPx) * 2;
        if (sizeRatio * basePt > avail && sizeRatio > 0) {
          return Math.max(8, (basePt * avail) / (sizeRatio * basePt)) / 0.75;
        }
        return basePx;
      },
      // Header ink box from the exporter's OWN wrap (card t_a8f48654): the
      // line counts headerWrapLines will actually draw, charged at the same
      // per-line struts (headerTextStrutsBoxPx) — so the plan and the ink
      // agree for wrapped headers exactly as they did for single-line ones.
      headerBoxPx(profile, contentWidthPx) {
        const hName = sanitizeText(profile.name);
        const hTitle = sanitizeText(profile.title);
        if (!hName && !hTitle && !profile.hasPhoto) return 0;
        // With a photo the text column is flex: 1 beside the 96px box and
        // the gap — the same width renderProfileHeader wraps at.
        const wrapW = profile.hasPhoto ? contentWidthPx - PHOTO_PX - PHOTO_GAP_PX : contentWidthPx;
        const { nameLines, titleLines } = headerWrapLines(doc, hName, hTitle, px2pt(wrapW), setMFont);
        return headerTextStrutsBoxPx(nameLines.length, titleLines.length, profile.hasPhoto);
      },
    };
  };

  return { fontStyles, embedded, fontFam, fontStack, baselineRatio, makeMeasure };
}

/** Paint one two-column chunk of the shared flow plan. The columns are
 *  independent stacks starting at the chunk's block top; each entry advances
 *  by its planned step (ink box + spacing.item — margins of flex items stay
 *  INSIDE the column box, DOM-measured), so the render can never re-derive
 *  a different step than the plan paginated with. */
function renderChunk(ctx: RenderContext, chunk: FlowChunk, y: number): void {
  const colGapPt = px2pt(ctx.spacing.item * 4);
  const colWidthPt = (ctx.contentWidth - colGapPt) / 2;
  const ctxL: RenderContext = { ...ctx, contentWidth: colWidthPt };
  const ctxR: RenderContext = {
    ...ctx,
    contentWidth: colWidthPt,
    pageMargin: ctx.pageMargin + colWidthPt + colGapPt,
  };
  let yL = y;
  for (const it of chunk.left) {
    renderEntry(ctxL, it.entry, yL);
    yL += px2pt(it.stepPx);
  }
  let yR = y;
  for (const it of chunk.right) {
    renderEntry(ctxR, it.entry, yR);
    yR += px2pt(it.stepPx);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Export a CV to a print-ready A4 PDF with vector graphics and embedded fonts.
 *
 * All text, shapes, borders, and layout elements are rendered as native
 * PDF vector operations — text is selectable, lines are crisp at any zoom.
 * The chosen Google Font is embedded as a subsetted TrueType font, so the
 * PDF matches the on-screen preview exactly. Only the profile photo (if
 * present) is embedded as a raster image.
 *
 * @param _element  Kept for API compatibility with the old html2canvas version.
 *                  No longer used — rendering is entirely data-driven.
 * @param options   Export options including cvData (structured CV content).
 */
export async function exportToPdf(
  _element: HTMLElement,
  options: PdfExportOptions & { cvData?: PdfCVData } = {}
): Promise<void | ArrayBuffer> {
  const data = options.cvData;
  if (!data) {
    throw new Error(
      "Vector PDF export requires cvData. The caller must pass structured CV data."
    );
  }

  const filenameBase = filenameBaseFromName(options.profileName || data.profileName);
  // Merged multi-language exports carry the language codes in the filename
  // (…_hu-en.pdf) so the file identifies what is inside it.
  const filename =
    options.allLanguages && options.allLanguages.length > 1
      ? `${filenameBase}_${options.allLanguages.map((l) => l.code).join("-")}.pdf`
      : `${filenameBase}.pdf`;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
    compress: true,
  });

  // PDF metadata
  const metaName = sanitizeText(data.profileName) || "CV";
  doc.setProperties({
    title: `CV — ${metaName}`,
    subject: sanitizeText(data.profileTitle) || "Curriculum Vitae",
    author: metaName,
    keywords: "cv, resume",
    creator: "CV Creator",
  });

  const pageWidthPt = doc.internal.pageSize.getWidth();
  const pageHeightPt = doc.internal.pageSize.getHeight();

  const design = data.design;
  const template = getTemplate(design.template ?? "clean");
  // Global heading-style override — resolved by the shared module (ONE
  // owner: the preview's renderHeading resolves the same way).
  const effectiveTemplate: TemplateConfig = {
    ...template,
    headingStyle: resolveHeadingStyle(design, template),
  };
  const palette = getPalette(
    (design.custom_config?.paletteId as string) ?? template.defaultPalette
  );
  const colors = resolveColors(design, palette);
  const spacing = {
    ...SPACING_VALUES[design.spacing ?? "normal"],
    // User line-height preset overrides the spacing preset's default
    lineHeight: getLineHeightValue(design, design.spacing ?? "normal"),
  };
  const borderRadius = design.border_radius ?? 8;
  const pageMargin = px2pt(design.page_margin ?? 48);
  const profileRim = (design.custom_config?.profileRim as boolean) ?? true;
  const profileRadius = (design.custom_config?.profileRadius as number) ?? 48;
  const profileImagePosition = (design.custom_config?.profileImagePosition as string) ?? "left";
  // Content box width from the shared module (px → pt): the preview's
  // 794 − 2·margin px content box, NOT the PDF page's own pt width
  // (595.28 − 72 = 523.28 vs 523.5 pt) — the ~0.22 pt difference moved
  // wrapped rows and the right-aligned year edge off the preview grid.
  const contentWidth = px2pt(contentBoxWidthPx(design));
  // Content-box height in pt — the flow's top-anchored bound AND the top
  // of the bottom margin band (the end-of-CV contact block draws from it).
  const contentHeightPt = px2pt(contentBoxHeightPx(design));
  // Whether the rendered header carries a photo: includePhoto=false strips
  // it at export time — the same condition the preview's profilePicture
  // prop applies (the editors pass includePhotoInPdf ? photo : null), so
  // the header AND the contact block align the same way on both sides.
  const hasPhoto =
    options.includePhoto === false ? false : Boolean(data.profilePicture);
  // End-of-CV contact lines (phone / e-mail, own checkbox each) — read
  // ONCE from custom_config; drawn in the bottom margin band of every
  // language block's LAST page, outside the flow.
  const contactBlock = contactLines(design);

  // Fonts + the flow measurement setup: try to embed the real typeface
  // (vector TTF from the Fontsource CDN, cached by the browser after first
  // export); fall back to built-ins. setupPdfMeasure resolves the SAME
  // fontFam/embedded/baselineRatio for the render context and hands out the
  // per-language FlowMeasure the shared layout module consumes.
  const setup = await setupPdfMeasure(doc, design);
  const fontStyles = setup.fontStyles;
  const embedded = setup.embedded;
  const fontFam = setup.fontFam;
  const baselineRatio = setup.baselineRatio;

  const ctx: RenderContext = {
    doc,
    palette,
    template: effectiveTemplate,
    spacing,
    borderRadius,
    pageMargin,
    accent: colors.accent,
    primary: colors.primary,
    subtitle: colors.subtitle,
    pageMarginColor: colors.bg,
    contentBgColor: colors.contentBg,
    textColor: colors.text,
    mutedColor: colors.muted,
    // Description placement (custom_config): "below" default, or "inline"
    inlineDesc: ((design.custom_config?.descriptionPlacement as string) ?? "below") === "inline",
    descSeparator:
      ((design.custom_config?.descriptionSeparator as string) ?? "—") || "—",
    profileRim,
    profileRadius,
    profileImagePosition,
    activeLang: data.activeLang,
    contentWidth,
    contentHeightPt,
    pageHeightPt,
    pageWidthPt,
    fontFam,
    fontStyles,
    embedded,
    baselineRatio,
  };

  // Filter enabled sections and entries
  const enabledSections = data.sections.filter((s) => s.is_enabled);
  const enabledSectionsWithEntries = enabledSections.map((s) => ({
    ...s,
    entries: s.entries.filter((e) => e.is_enabled),
  }));

  // Language plan: one complete document per language, appended into THIS PDF.
  // Default (no allLanguages plan) = the active language only — the original
  // single-language behaviour.
  const languagePlan =
    options.allLanguages && options.allLanguages.length > 0
      ? options.allLanguages
      : [{ code: data.activeLang, name: data.profileName, title: data.profileTitle }];

  let freshPageAvailable = true;

  // ── Phase 1: per-language flow plans + the anchor triple set ───────────
  // The per-style baseline anchors must be resolved BEFORE any page renders
  // (the probe is async, the render walk is not). Heading triples depend on
  // the auto-shrunk sizes the flow plan resolves, so collect plans first.
  const triples = new Map<string, AnchorTriple>();
  const addTriple = (t: AnchorTriple) => triples.set(anchorKey(t), t);
  // Header (no-photo struts; the photo branch draws hard-coded baselines):
  addTriple({ weight: 700, italic: false, fsPx: 28, strutPx: 33.6 }); // name h1
  addTriple({ weight: 500, italic: false, fsPx: 14, strutPx: HEADER_TITLE_STRUT_PX }); // subtitle div
  // End-of-CV contact block rows (12 px normal, single line-height):
  addTriple({ weight: 400, italic: false, fsPx: CONTACT_LINE_PX, strutPx: CONTACT_LINE_PX });
  // Entry rows (title span font-semibold 600; org/desc text-sm italic 400):
  addTriple({ weight: 600, italic: false, fsPx: TITLE_FS_PX, strutPx: TITLE_FS_PX * spacing.lineHeight });
  if (ctx.inlineDesc) {
    const strutIpx = Math.max(BODY_STRUT_PX, TITLE_FS_PX * spacing.lineHeight);
    addTriple({ weight: 600, italic: false, fsPx: TITLE_FS_PX, strutPx: strutIpx });
    addTriple({ weight: 400, italic: true, fsPx: 14, strutPx: strutIpx });
  }
  addTriple({ weight: 400, italic: true, fsPx: 14, strutPx: BODY_STRUT_PX });

  const plans: Array<{
    langData: PdfCVData;
    langCtx: RenderContext;
    placed: ReturnType<typeof paginate>;
    pageCount: number;
  }> = [];
  for (const language of languagePlan) {
    // Per-language data: translations and the header name/title resolve on
    // activeLang, so the flow plan must be recomputed for every language
    // (wrap counts and the profile-header height can differ per language).
    const langData: PdfCVData = {
      ...data,
      activeLang: language.code,
      profileName: language.name,
      profileTitle: language.title,
    };
    const langCtx: RenderContext = { ...ctx, activeLang: language.code };

    // ONE shared flow plan (src/lib/cv-flow-layout.ts): the same block
    // heights and pagination rules the preview uses. This renderer only
    // PAINTS the plan through px2pt() — it owns no layout arithmetic.
    const blocks = computeFlowBlocks(
      enabledSectionsWithEntries,
      design,
      language.code,
      {
        profile: {
          name: langData.profileName,
          title: langData.profileTitle,
          // includePhoto=false renders without the photo — paginate the
          // header the renderer actually draws (no phantom photo height).
          hasPhoto,
        },
        measure: setup.makeMeasure(language.code),
      }
    );
    // Heading anchors are per auto-shrunk size — collect them for the probe.
    for (const b of blocks) {
      if (b.kind === "heading") {
        const headingFsPx = b.fontSizePx ?? 18;
        addTriple({
          weight: effectiveTemplate.headingStyle === "minimal" ? 600 : 700,
          italic: false,
          fsPx: headingFsPx,
          strutPx: headingFsPx * 1.5,
        });
      }
    }
    const placed = paginate(blocks, contentBoxHeightPx(design));
    const pageCount =
      placed.length > 0
        ? Math.max(...placed.map((p) => p.pageIndex)) + 1
        : 1;
    plans.push({ langData, langCtx, placed, pageCount });
  }

  // ── Phase 2: per-style baseline anchors ────────────────────────────────
  // Harness-injected values win (they reproduce the in-browser placement
  // under Node — see PdfExportOptions.baselineRatios); otherwise probe the
  // real engine in the browser. Empty map (Node) → single fallback ratio.
  const styleRatios: Map<string, number> = options.baselineRatios
    ? new Map(Object.entries(options.baselineRatios))
    : await probeStyleRatios(setup.fontStack, [...triples.values()]);
  for (const plan of plans) plan.langCtx.styleRatios = styleRatios;

  for (const { langData, langCtx, placed, pageCount } of plans) {

    for (let pageIdx = 0; pageIdx < pageCount; pageIdx++) {
      // The doc's initial blank page serves the FIRST page of the FIRST
      // language; every later page — including each following language's
      // first page — starts with addPage().
      if (!freshPageAvailable || pageIdx > 0) doc.addPage();
      freshPageAvailable = false;

      drawPageBackground(langCtx);

      for (const p of placed) {
        if (p.pageIndex !== pageIdx) continue;
        const b = p.block;
        // Paint at the plan's content-relative top (px → pt, page origin at
        // pageMargin). sectionTail is a pure gap — nothing to draw.
        switch (b.kind) {
          case "header":
            if (pageIdx === 0) {
              const pageData: PdfCVData = {
                ...langData,
                profilePicture:
                  options.includePhoto === false ? null : data.profilePicture,
              };
              await renderProfileHeader(langCtx, pageData);
            }
            break;
          case "heading":
            renderHeading(
              langCtx,
              b.title ?? "",
              pageMargin + px2pt(p.topPx),
              px2pt(b.fontSizePx ?? 18)
            );
            break;
          case "entry":
            if (b.entry) {
              renderEntry(langCtx, b.entry, pageMargin + px2pt(p.topPx));
            }
            break;
          case "twocolChunk":
            if (p.chunk) {
              renderChunk(langCtx, p.chunk, pageMargin + px2pt(p.topPx));
            }
            break;
          default:
            break;
        }
      }
    }

    // End-of-CV contact block: the bottom margin band of THIS language's
    // LAST page — the doc's current page after the loop above. Merged
    // all-languages exports therefore end EVERY language block with its
    // own contact block (same values, per-language last page); single-
    // language exports draw it once, on the document's last page.
    // Outside the flow: no plan block, no flow height, no page breaks.
    if (contactBlock.length > 0) {
      renderContactBlock(
        langCtx,
        contactBlock,
        pageMarginPx(design),
        !hasPhoto
      );
    }
  }

  if (options.output === "arraybuffer") return doc.output("arraybuffer");
  doc.save(filename);
}