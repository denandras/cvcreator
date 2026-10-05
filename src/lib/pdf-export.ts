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
  /** Filename without extension */
  profileName?: string;
  /** Whether to include the photo */
  includePhoto?: boolean;
  /** "save" (default, browser download) or "arraybuffer" (returns bytes — used by tests/harnesses) */
  output?: "save" | "arraybuffer";
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

type FontStyle = "normal" | "bold" | "italic" | "bolditalic";

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

/** Strip whitespace and collapse newlines for PDF text rendering */
function sanitizeText(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Convert px (96-DPI screen) to pt (1/72 inch): 1px = 0.75pt at 96 DPI */
function px2pt(px: number): number {
  return px * 0.75;
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
  textColor: string;
  mutedColor: string;
  profileRim: boolean;
  profileRadius: number;
  profileImagePosition: string;
  activeLang: string;
  contentWidth: number; // in pt
  pageHeightPt: number;
  pageWidthPt: number;
  fontFam: string; // "helvetica" or "times" (built-in fallback)
  fontStyles?: Record<FontStyle, string>; // embedded per-style families
  embedded: boolean;
}

// ─── Effective colors (custom overrides win over palette) ────────────────────

interface EffectiveColors {
  primary: string;
  accent: string;
  bg: string;
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

function setStroke(ctx: RenderContext, color: string): void {
  const [r, g, b] = rgb255(color);
  ctx.doc.setDrawColor(r, g, b);
}

function setText(ctx: RenderContext, color: string): void {
  const [r, g, b] = rgb255(color);
  ctx.doc.setTextColor(r, g, b);
}

function setFont(ctx: RenderContext, style: FontStyle, sizePt: number): void {
  const fam = ctx.embedded ? ctx.fontStyles?.[style] : undefined;
  if (fam) {
    // Unique per-style families are registered with the single "normal" style.
    ctx.doc.setFont(fam, "normal");
  } else {
    ctx.doc.setFont(ctx.fontFam, style);
  }
  ctx.doc.setFontSize(sizePt);
}

function drawPageBackground(ctx: RenderContext): void {
  setFill(ctx, ctx.pageMarginColor);
  ctx.doc.rect(0, 0, ctx.pageWidthPt, ctx.pageHeightPt, "F");
}

function renderHeading(
  ctx: RenderContext,
  title: string,
  y: number
): number {
  const { doc, template, accent, primary, borderRadius, pageMargin, contentWidth } = ctx;
  const text = title.toUpperCase();

  // Bigger section titles (was 14pt): shrink only if the measured title
  // would exceed the content width.
  const fitPt = (basePt: number, padPt: number): number => {
    if (!text) return basePt;
    const probe = { ...ctx } as RenderContext;
    doc.setFont(probe.fontFam ?? "helvetica", "bold");
    const sizeRatio = doc.getTextWidth(text) / (basePt || 1); // width per pt at base size
    const avail = contentWidth - padPt * 2;
    if (sizeRatio * basePt > avail && sizeRatio > 0) {
      return Math.max(8, (basePt * avail) / (sizeRatio * basePt));
    }
    return basePt;
  };
  const fontSize = fitPt(px2pt(18), 0);

  switch (template.headingStyle) {
    case "underline": {
      setFont(ctx, "bold", fontSize);
      setText(ctx, primary);
      doc.text(text, pageMargin, y);
      setStroke(ctx, accent);
      doc.setLineWidth(1.5);
      doc.line(pageMargin, y + 3, pageMargin + contentWidth, y + 3);
      doc.setLineWidth(0.2);
      return y + px2pt(12);
    }
    case "border": {
      setFont(ctx, "bold", fontSize);
      setText(ctx, primary);
      setStroke(ctx, accent);
      doc.setLineWidth(2.25);
      doc.line(pageMargin, y - fontSize + 1, pageMargin, y + 3);
      doc.setLineWidth(0.2);
      doc.text(text, pageMargin + px2pt(13), y);
      return y + px2pt(12);
    }
    case "filled": {
      setFont(ctx, "bold", fontSize);
      const textWidth = doc.getTextWidth(text);
      const padX = px2pt(12);
      const padY = px2pt(6);
      const boxW = textWidth + padX * 2;
      const boxH = fontSize + padY * 2;
      setFill(ctx, accent);
      roundedRect(doc, pageMargin, y - fontSize, boxW, boxH, borderRadius, "F");
      const [wr, wg, wb] = readableOn(accent);
      doc.setTextColor(wr, wg, wb);
      doc.text(text, pageMargin + padX, y + padY * 0.5);
      return y - fontSize + boxH + px2pt(12);
    }
    case "minimal": {
      setFont(ctx, "bold", fitPt(px2pt(16), 0));
      setText(ctx, primary);
      doc.text(text, pageMargin, y, { charSpace: 1.2 });
      return y + px2pt(8);
    }
    default: {
      setFont(ctx, "bold", fontSize);
      setText(ctx, primary);
      doc.text(text, pageMargin, y);
      return y + px2pt(12);
    }
  }
}

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

  const titleFontSize = px2pt(15.2); // 0.95rem
  const bodyFontSize = px2pt(14);    // text-sm
  const yearFontSize = px2pt(12);    // text-xs

  if (title) {
    setFont(ctx, "bold", titleFontSize);
    setText(ctx, primary);

    const yearText = year != null && year !== 0 ? String(year) : "";
    const yearW = yearText ? doc.getTextWidth(yearText) + px2pt(12) : 0;
    const titleMaxWidth = contentWidth - yearW;
    const titleLines = doc.splitTextToSize(title, titleMaxWidth) as string[];
    doc.text(titleLines, pageMargin, y);
    const titleBlockHeight = titleLines.length * titleFontSize;

    if (yearText) {
      setFont(ctx, "normal", yearFontSize);
      setText(ctx, ctx.mutedColor);
      doc.text(yearText, pageMargin + contentWidth, y, { align: "right" });
    }

    y += titleBlockHeight;
  }

  if (organization) {
    setFont(ctx, "italic", bodyFontSize);
    setText(ctx, ctx.mutedColor);
    const orgLines = doc.splitTextToSize(organization, contentWidth) as string[];
    doc.text(orgLines, pageMargin, y);
    y += orgLines.length * (bodyFontSize * 1.1);
  }

  if (description) {
    setFont(ctx, "italic", bodyFontSize);
    setText(ctx, ctx.textColor);
    const descLines = wrapText(doc, description, contentWidth);
    const lineH = bodyFontSize * spacing.lineHeight;
    doc.text(descLines, pageMargin, y + bodyFontSize * 0.4);
    y += descLines.length * lineH;
  }

  y += px2pt(spacing.item);
  return y;
}

function renderSection(
  ctx: RenderContext,
  section: SectionWithEntries,
  y: number
): number {
  const { spacing, template, pageMargin, contentWidth } = ctx;

  const layout = section.layout_config as Record<string, unknown>;
  const twoCol =
    layout?.columns === "two" ? true :
    layout?.columns === "one" ? false :
    template.twoColumnDefault;

  // Continuation of a section split across pages: entries only, no heading.
  // A continuation group is always the first group on its page (flow order:
  // the rows that broke onto the new page come first), so start exactly at
  // pageTop — subtracting a "tight gap" here pushed the first line ~7.5pt
  // above the top margin (ink yMin 20.7pt vs margin 36pt in bbox audits).
  const isContinuation = (section as SectionWithEntries & { isContinuation?: boolean }).isContinuation === true;
  if (!isContinuation) {
    y = renderHeading(ctx, sanitizeText(section.title), y);
  }

  if (twoCol && section.entries.length > 1) {
    const colGap = px2pt(spacing.item * 4);
    const colWidth = (contentWidth - colGap) / 2;

    // Split-block metadata: flush() recorded the exact per-column lists per
    // page chunk (twocolChunks). Prefer that; fall back to the classic
    // sequential halves when absent (whole section on one page, no split).
    // Columns are INDEPENDENT STACKS, not a strict grid: on a chunk the two
    // sides end at different heights, and the section flows to the lower
    // bottom instead of re-aligning horizontal rows.
    const meta = section as SectionWithEntries & {
      twocolChunks?: Array<{
        left: SectionWithEntries["entries"][0][];
        right: SectionWithEntries["entries"][0][];
      }>;
    };
    const chunksMeta = meta.twocolChunks;
    if (chunksMeta && chunksMeta.length > 0) {
      const ctxCol: RenderContext = { ...ctx, contentWidth: colWidth };
      const ctxCol2: RenderContext = {
        ...ctx,
        contentWidth: colWidth,
        pageMargin: pageMargin + colWidth + colGap,
      };
      for (const chunk of chunksMeta) {
        let yL = y;
        for (const entry of chunk.left) yL = renderEntry(ctxCol, entry, yL);
        let yR = y;
        for (const entry of chunk.right) yR = renderEntry(ctxCol2, entry, yR);
        // Section tail: continue from the TALLER column bottom so the
        // section gap after the last chunk matches the classic layout.
        y = Math.max(yL, yR);
      }
    } else {
      const mid = Math.ceil(section.entries.length / 2);
      const col1 = section.entries.slice(0, mid);
      const col2 = section.entries.slice(mid);

      const yStart = y;
      const ctxCol1: RenderContext = { ...ctx, contentWidth: colWidth };
      for (const entry of col1) {
        y = renderEntry(ctxCol1, entry, y);
      }
      const yAfterCol1 = y;

      y = yStart;
      const ctxCol2: RenderContext = {
        ...ctx,
        contentWidth: colWidth,
        pageMargin: pageMargin + colWidth + colGap,
      };
      for (const entry of col2) {
        y = renderEntry(ctxCol2, entry, y);
      }
      y = Math.max(y, yAfterCol1);
    }
  } else {
    for (const entry of section.entries) {
      y = renderEntry(ctx, entry, y);
    }
  }

  // Continuations (rows flowed from the previous page) keep a tight gap;
  // real section ends keep the full section gap.
  if (!isContinuation) {
    y += px2pt(spacing.section);
  } else {
    y += px2pt(spacing.item) + px2pt(2);
  }
  return y;
}

async function renderProfileHeader(
  ctx: RenderContext,
  data: PdfCVData
): Promise<number> {
  const { doc, accent, primary, spacing, pageMargin, contentWidth } = ctx;
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
      : pageMargin + photoSize + px2pt(16); // gap-4

    if (ctx.profileRim) {
      setStroke(ctx, accent);
      doc.setLineWidth(1.5);
      doc.rect(photoX - 1.5, y - 1.5, photoSize + 3, photoSize + 3, "S");
      doc.setLineWidth(0.2);
    }

    await embedPhoto(doc, data.profilePicture, photoX, y, photoSize, photoSize);

    if (name) {
      setFont(ctx, "bold", px2pt(28)); // 1.75rem
      setText(ctx, primary);
      doc.text(name, textX, y + px2pt(12));
    }

    if (title) {
      setFont(ctx, "normal", px2pt(14));
      setText(ctx, ctx.subtitle);
      const titleY = name ? y + px2pt(28) : y + px2pt(14);
      doc.text(title.toUpperCase(), textX, titleY);
    }

    y += photoSize + px2pt(spacing.section);
  } else {
    if (name) {
      setFont(ctx, "bold", px2pt(28));
      setText(ctx, primary);
      doc.text(name, pageMargin + contentWidth / 2, y + px2pt(12), { align: "center" });
    }
    if (title) {
      setFont(ctx, "normal", px2pt(14));
      setText(ctx, ctx.subtitle);
      const titleY = name ? y + px2pt(28) : y + px2pt(14);
      doc.text(title.toUpperCase(), pageMargin + contentWidth / 2, titleY, { align: "center" });
    }
    y += px2pt(40) + px2pt(spacing.section);
  }

  // Divider line below header
  setStroke(ctx, ctx.palette.surface);
  doc.setLineWidth(0.5);
  doc.line(pageMargin, y, pageMargin + contentWidth, y);
  doc.setLineWidth(0.2);
  y += px2pt(spacing.section);

  return y;
}


// ─── Flow pagination ─────────────────────────────────────────────────────────
//
// Content flows freely: every heading/entry/row is measured and placed on the
// current page while it fits; a page break happens ONLY when the next item
// genuinely doesn't fit. The user controls forced breaks with a per-section
// "page break before" checkbox (layout_config.page_break_before) — the system
// never inserts judgment-based breaks of its own. A section may continue on
// the next page (entries only, no repeated heading).

interface FlowItem {
  kind: "heading" | "entry" | "twocol" | "twocolChunk";
  section: SectionWithEntries;
  entry?: SectionWithEntries["entries"][0];
  /** Independent-column page chunk: entries placed side by side, stacks not row-aligned */
  chunk?: {
    left: SectionWithEntries["entries"][0][];
    right: SectionWithEntries["entries"][0][];
  };
}

/** Per-style heading advance in pt — MUST equal renderHeading's return
 * advance for the given headingStyle: underline/border/default = y+px2pt(12),
 * "filled" = y-fontSize+boxH+px2pt(12) = y+18pt (fontSize 13.5, boxH 22.5),
 * "minimal" = y+px2pt(8). The heading glyph/box extends UPWARD from the
 * baseline; that space is covered by the PREVIOUS item's gap, so only the
 * downward advance counts here. */
function headingAdvancePt(headingStyle: string): number {
  switch (headingStyle) {
    case "filled":
      return 18; // pt: -fontSize(13.5) + boxH(22.5) + 9 (=12px)
    case "minimal":
      return px2pt(8);
    default:
      return px2pt(12);
  }
}

/** Exact height the profile header will consume on page 1 — MUST mirror
 * renderProfileHeader. The photo branch is 96px + 2×section gap + 16px rim/
 * padding; the NO-photo branch is name/title block + divider ≈ 40px + 15pt
 * + 15pt. Charging the photo height when no photo exists pushed every flow Y
 * ~69pt below reality → premature first break (the "random extra page"). */
function profileHeaderHeightPt(data: PdfCVData, spacingSection: number): number {
  const hasNameOrTitle = Boolean(sanitizeText(data.profileName) || sanitizeText(data.profileTitle));
  const hasPhoto = Boolean(data.profilePicture);
  if (!hasNameOrTitle && !hasPhoto) return 0;
  if (hasPhoto) {
    return px2pt(96) + px2pt(spacingSection) * 2 + px2pt(16);
  }
  // No photo: name (12px→28px advance) or title (14px) + 40px block + 15pt divider gap ×2
  const block = hasNameOrTitle ? px2pt(40) : 0;
  return px2pt(40) + px2pt(spacingSection) * 2;
}

function flowLayout(
  ctx: RenderContext,
  sections: SectionWithEntries[],
  headerHeightPt: number
): SectionWithEntries[][] {
  const { doc, spacing, template, contentWidth, activeLang, pageMargin } = ctx;
  const pageTop = pageMargin;
  // The renderer can never place ink below pageHeightPt - pageMargin, so use
  // the same bound for the break decision (an extra arbitrary breathing-room
  // offset here breaks pages earlier than the render needs).
  const bottomLimit = ctx.pageHeightPt - pageMargin;

  // ── Measure every flow item ──────────────────────────────────────────────
  // CRITICAL: measurement MUST use the same fonts/sizes that renderEntry will
  // use (embedded per-style families at bold 15.2pt / body 14pt), or wrap
  // counts drift and the layout breaks pages earlier than the render needs —
  // the visible symptom is a nearly-empty extra last page.
  interface Measured {
    item: FlowItem;
    height: number;
  }

  const measureEntry = (
    entry: SectionWithEntries["entries"][0],
    width: number
  ): number => {
    const translation = entry.translations.find((t) => t.language === activeLang);
    const title = sanitizeText(translation?.title ?? "");
    const organization = sanitizeText(translation?.organization ?? "");
    const description = sanitizeText(translation?.description ?? "");
    const titleFontSize = px2pt(15.2);
    const bodyFontSize = px2pt(14);
    let h = 0;
    if (title) {
      setFont(ctx, "bold", titleFontSize);
      // Reserve space for the right-aligned year like the real renderer does
      const yearText = entry.year != null && entry.year !== 0 ? String(entry.year) : "";
      const yearW = yearText ? doc.getTextWidth(yearText) + px2pt(12) : 0;
      const lines = doc.splitTextToSize(title, Math.max(40, width - yearW)) as string[];
      h += lines.length * titleFontSize;
    }
    if (organization) {
      setFont(ctx, "italic", bodyFontSize);
      const lines = doc.splitTextToSize(organization, width) as string[];
      h += lines.length * (bodyFontSize * 1.1);
    }
    if (description) {
      setFont(ctx, "italic", bodyFontSize);
      const lines = wrapText(doc, description, width);
      h += lines.length * bodyFontSize * spacing.lineHeight;
    }
    h += px2pt(spacing.item);
    return h;
  };

  const measured: Measured[] = [];

  for (const section of sections) {
    const layout = section.layout_config as Record<string, unknown>;
    const twoCol =
      layout?.columns === "two" ? true :
      layout?.columns === "one" ? false :
      template.twoColumnDefault;

    // Heading item = the heading's advance for this template's heading style
    // PLUS the section's trailing gap (renderSection appends spacing.section
    // after the body). The 18px-tall heading glyph extends UP from the
    // baseline into the previous section's tail, so only the DOWNWARD
    // advance is charged here. Empty sections render no tail.
    const tail = px2pt(section.entries.length > 0 ? spacing.section : 0);
    measured.push({
      item: { kind: "heading", section },
      height: headingAdvancePt(template.headingStyle) + tail,
    });

    if (twoCol && section.entries.length > 1) {
      // Two-column: NO strict grid. Entries are dealt onto two independent
      // column stacks (next entry → currently shorter stack), and the whole
      // two-column block paginates in CHUNKS: whatever fits on the current
      // page is placed side by side; each column's leftovers continue on the
      // next page at a different entry count. Heights are measured per chunk
      // as the taller stack — the same value the renderer produces when each
      // column is a free-running stack and the section ends at the lower
      // column's bottom.
      const colGap = px2pt(spacing.item * 4);
      const colWidth = (contentWidth - colGap) / 2;
      // Sequential halves (unchanged from the classic layout): left column
      // takes the first ⌈n/2⌉ entries, right the rest. Only the page-BREAK
      // behavior changes — each column paginates independently below.
      const half = Math.ceil(section.entries.length / 2);
      const col1 = section.entries.slice(0, half);
      const col2 = section.entries.slice(half);
      // Raw heights (each includes its trailing item-gap, exactly what
      // renderEntry advances per entry).
      const h1 = col1.reduce((a, e) => a + measureEntry(e, colWidth), 0);
      const h2 = col2.reduce((a, e) => a + measureEntry(e, colWidth), 0);
      measured.push({
        item: { kind: "twocol", section, chunk: { left: col1, right: col2 } },
        height: Math.max(h1, h2, 0),
      });
    } else {
      for (const entry of section.entries) {
        measured.push({
          item: { kind: "entry", section, entry },
          height: measureEntry(entry, contentWidth),
        });
      }
    }
  }

  // ── Distribute across pages ────────────────────────────────────────────────
  // Pure flow: items fill the current page; a break happens only when the
  // next item doesn't fit. A section's heading starts a new page only when
  // the user set layout_config.page_break_before on that section.
  //
  // Two-column chunks split like everything else: the columns are independent
  // stacks, so the split point differs per column — fill each column with its
  // own prefix up to the free height, and let the non-aligned remainders
  // continue on the next page (no row re-alignment).
  const pages: SectionWithEntries[][] = [];
  let pageItems: Measured[] = [];
  let currentY = pageTop + headerHeightPt;
  // Continuation-gap bookkeeping (see charge/arm sites in the loop below).
  let contTailDue = 0;
  let contTailSection: string | null = null;

  const flush = (extraItems?: Measured[]) => {
    if (pageItems.length === 0 && !(extraItems && extraItems.length > 0)) return;
    // Convert flow items back into page section groups. Groups preserve
    // original section order; a section split across pages appears on both.
    // A group that doesn't contain the section's own heading flow item is a
    // continuation: the renderer skips the heading for it.
    const pageSections: SectionWithEntries[] = [];
    const seen = new Map<
      string,
      { group: SectionWithEntries; hasHeading: boolean }
    >();
    const allItems = extraItems
      ? [...pageItems, ...extraItems]
      : pageItems;
    for (const { item } of allItems) {
      const s = item.section;
      let rec = seen.get(s.id);
      if (!rec) {
        const group: SectionWithEntries = { ...s, entries: [] };
        rec = { group, hasHeading: false };
        seen.set(s.id, rec);
        pageSections.push(group);
      }
      if (item.kind === "heading") {
        rec.hasHeading = true;
      }
      if (item.entry) {
        rec.group.entries.push(item.entry);
      } else if ((item.kind === "twocol" || item.kind === "twocolChunk") && item.chunk) {
        // Two-column chunk: ship the exact per-column lists on the group —
        // the renderer stacks each column independently, non row-aligned.
        const meta = rec.group as SectionWithEntries & {
          twocolChunks?: Array<{ left: SectionWithEntries["entries"][0][]; right: SectionWithEntries["entries"][0][] }>;
        };
        if (!meta.twocolChunks) meta.twocolChunks = [];
        meta.twocolChunks.push({ left: item.chunk.left, right: item.chunk.right });
        rec.group.entries.push(...item.chunk.left, ...item.chunk.right);
      }
    }
    // Mark continuation groups (no heading on this page) so the renderer
    // knows not to repeat the heading.
    for (const section of pageSections) {
      const rec = seen.get(section.id)!;
      if (!rec.hasHeading) {
        (section as SectionWithEntries & { isContinuation?: boolean }).isContinuation =
          true;
      }
    }
    pages.push(pageSections);
    pageItems = [];
  };

  for (let i = 0; i < measured.length; i++) {
    const m = measured[i];

    // The renderer adds a tight continuation gap (item gap + 2px) after a
    // split section's continuation rows before the next group on the same
    // page (see renderSection). Mirror it in measurement: charge once, after
    // the continuation's rows, before the first item of a different group.
    if (
      contTailDue > 0 &&
      (m.item.section.id !== contTailSection ||
        (m.item.kind !== "entry" && m.item.kind !== "twocolChunk"))
    ) {
      currentY += contTailDue;
      contTailDue = 0;
    }

    // User-controlled break: this section was explicitly set to start on a
    // fresh page (checkbox in the editor). Only applies at the section's
    // heading, and never when the page is already empty.
    if (
      m.item.kind === "heading" &&
      pageItems.length > 0 &&
      ((m.item.section.layout_config as Record<string, unknown> | null)?.page_break_before === true)
    ) {
      flush();
      currentY = pageTop;
    }

    // Pure flow (R2): everything fills the current page; break only when the
    // next item genuinely doesn't fit. The previous item's trailing item-gap
    // is charged in its measured height but is invisible when it ends the
    // page (nothing follows it before the break) — waive it so knife-edge
    // rows aren't pushed over by dead space.
    if (currentY + m.height > bottomLimit && pageItems.length > 0) {
      const prevHeight =
        m.item.kind === "heading" || !measured[i - 1] ? 0 : px2pt(spacing.item);
      if (currentY - prevHeight + m.height <= bottomLimit) {
        currentY -= prevHeight;
        const prevPlaced = pageItems[pageItems.length - 1];
        // Waiver only applies to gap-only padding, never to real ink height:
        // shrink the stored height too, so render's own advance matches.
        if (prevPlaced) prevPlaced.height -= prevHeight;
      } else {
        // Split two-column chunks like a single long entry: each column is
        // an independent stack, so fill per-column prefixes up to the free
        // height and let the (different-length) remainders continue on the
        // fresh page — no row re-alignment.
        const twocolW = px2pt(spacing.item * 4);
        const colW = (contentWidth - twocolW) / 2;
        const EPS = 0.6; // pt tolerance for float drift in greedy fill
        let placedL: SectionWithEntries["entries"] = [];
        let placedR: SectionWithEntries["entries"] = [];
        let restL: SectionWithEntries["entries"] = [];
        let restR: SectionWithEntries["entries"] = [];
        let splittable = false;
        if ((m.item.kind === "twocol" || m.item.kind === "twocolChunk") && m.item.chunk) {
          const free = bottomLimit - currentY;
          let hL = 0;
          let hR = 0;
          for (const e of m.item.chunk.left) {
            const h = measureEntry(e, colW);
            if (hL + h <= free + EPS) {
              placedL.push(e);
              hL += h;
            } else {
              restL.push(e);
            }
          }
          for (const e of m.item.chunk.right) {
            const h = measureEntry(e, colW);
            if (hR + h <= free + EPS) {
              placedR.push(e);
              hR += h;
            } else {
              restR.push(e);
            }
          }
          splittable =
            placedL.length + placedR.length > 0 &&
            restL.length + restR.length > 0;
        }
        const sumH = (list: SectionWithEntries["entries"]) =>
          list.reduce((a, e) => a + measureEntry(e, colW), 0);
        if (splittable) {
          // Page N: existing items + the per-column fitted prefixes.
          const placed: Measured[] = [
            {
              item: {
                kind: "twocolChunk",
                section: m.item.section,
                chunk: { left: placedL, right: placedR },
              },
              height: Math.max(sumH(placedL), sumH(placedR), 0),
            },
          ];
          flush(placed);
          // Fresh page: the independent remainders as a continuation chunk.
          m.item.kind = "twocolChunk";
          m.item.chunk = { left: restL, right: restR };
          m.height = Math.max(sumH(restL), sumH(restR), 0);
          currentY = pageTop;
          // Continuation lands on a fresh page: arm the continuation tail.
          contTailDue = px2pt(spacing.item) + px2pt(2);
          contTailSection = m.item.section.id;
          pageItems.push(m);
          currentY += m.height;
          continue;
        }
        // Generic break: flush and retry the whole item on the fresh page.
        flush();
        currentY = pageTop;
        // Mid-section break: whatever lands on the fresh page is a
        // continuation group — arm the continuation tail for the next group.
        const prev = measured[i - 1]?.item;
        if (
          m.item.kind === "twocolChunk" ||
          (prev &&
            (prev.kind === "twocol" || prev.kind === "twocolChunk") &&
            prev.section.id === m.item.section.id)
        ) {
          contTailDue = px2pt(spacing.item) + px2pt(2);
          contTailSection = m.item.section.id;
        }
      }
    }
    pageItems.push(m);
    currentY += m.height;
  }
  flush();

  return pages.length > 0 ? pages : [sections];
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

  const filename =
    (options.profileName || data.profileName || "CV").replace(/[^a-zA-Z0-9_-]/g, "_") + ".pdf";

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
  const contentWidth = pageWidthPt - pageMargin * 2;

  // Fonts: try to embed the real typeface (vector TTF from Fontsource CDN,
  // cached by the browser after first export); fall back to built-ins.
  const fontValue = design.font_family ?? template.defaultFont;
  const fontStack = getFontStack(fontValue);
  const serifKeywords = ["serif", "Georgia", "Garamond", "Lora", "Merriweather", "Crimson", "Playfair"];
  const isSerif = serifKeywords.some((kw) => fontStack.includes(kw));
  const fontFam = isSerif ? "times" : "helvetica";

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

  const ctx: RenderContext = {
    doc,
    palette,
    template,
    spacing,
    borderRadius,
    pageMargin,
    accent: colors.accent,
    primary: colors.primary,
    subtitle: colors.subtitle,
    pageMarginColor: colors.bg,
    textColor: colors.text,
    mutedColor: colors.muted,
    profileRim,
    profileRadius,
    profileImagePosition,
    activeLang: data.activeLang,
    contentWidth,
    pageHeightPt,
    pageWidthPt,
    fontFam,
    fontStyles,
    embedded,
  };

  // Filter enabled sections and entries
  const enabledSections = data.sections.filter((s) => s.is_enabled);
  const enabledSectionsWithEntries = enabledSections.map((s) => ({
    ...s,
    entries: s.entries.filter((e) => e.is_enabled),
  }));

  // Determine page distribution: always the flow layout (pure flow +
  // per-section page_break_before flags from layout_config).
  const pageSections = (() => {
    const profileHeaderHeight = profileHeaderHeightPt(data, spacing.section);
    return flowLayout(ctx, enabledSectionsWithEntries, profileHeaderHeight);
  })();

  // Render pages
  for (let pageIdx = 0; pageIdx < pageSections.length; pageIdx++) {
    if (pageIdx > 0) doc.addPage();

    drawPageBackground(ctx);

    let y = pageMargin;

    if (pageIdx === 0) {
      const pageData: PdfCVData = {
        ...data,
        profilePicture:
          options.includePhoto === false ? null : data.profilePicture,
      };
      y = await renderProfileHeader(ctx, pageData);
    }

    for (const section of pageSections[pageIdx]) {
      y = renderSection(ctx, section, y);
    }
  }

  if (options.output === "arraybuffer") return doc.output("arraybuffer");
  doc.save(filename);
}