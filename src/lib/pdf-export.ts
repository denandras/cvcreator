"use client";

import jsPDF from "jspdf";
import type { SectionWithEntries, CVDesign } from "@/types/database";
import {
  getFontStack,
  getTemplate,
  getPalette,
  SPACING_VALUES,
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
  pageBreaks?: number[];
}

interface PdfExportOptions {
  /** Filename without extension */
  profileName?: string;
  /** Whether to include the photo */
  includePhoto?: boolean;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Parse a CSS color string (#hex or rgb()) into jsPDF RGB channels 0–1 */
function parseColor(color: string): [number, number, number] {
  const hex = color.trim();
  if (hex.startsWith("#")) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return [r || 0, g || 0, b || 0];
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
  pageMarginColor: string;
  profileRim: boolean;
  profileImagePosition: string;
  activeLang: string;
  contentWidth: number; // in pt
  pageHeightPt: number;
  pageWidthPt: number;
  fontFam: string; // "helvetica" or "times"
}

// ─── Render functions ──────────────────────────────────────────────────────────

function drawPageBackground(ctx: RenderContext): void {
  const [r, g, b] = rgb255(ctx.pageMarginColor);
  ctx.doc.setFillColor(r, g, b);
  ctx.doc.rect(0, 0, ctx.pageWidthPt, ctx.pageHeightPt, "F");
}

function renderHeading(
  ctx: RenderContext,
  title: string,
  y: number
): number {
  const { doc, template, accent, primary, borderRadius, fontFam, pageMargin, contentWidth } = ctx;
  const fontSize = px2pt(14); // 0.875rem
  const text = title.toUpperCase();

  switch (template.headingStyle) {
    case "underline": {
      doc.setFont(fontFam, "bold");
      doc.setFontSize(fontSize);
      const [pr, pg, pb] = rgb255(primary);
      doc.setTextColor(pr, pg, pb);
      doc.text(text, pageMargin, y);
      const [ar, ag, ab] = rgb255(accent);
      doc.setDrawColor(ar, ag, ab);
      doc.setLineWidth(1.5);
      doc.line(pageMargin, y + 3, pageMargin + contentWidth, y + 3);
      doc.setLineWidth(0.2);
      return y + px2pt(12);
    }
    case "border": {
      doc.setFont(fontFam, "bold");
      doc.setFontSize(fontSize);
      const [pr, pg, pb] = rgb255(primary);
      doc.setTextColor(pr, pg, pb);
      const [ar, ag, ab] = rgb255(accent);
      doc.setDrawColor(ar, ag, ab);
      doc.setLineWidth(2.25);
      doc.line(pageMargin, y - fontSize + 1, pageMargin, y + 3);
      doc.setLineWidth(0.2);
      doc.text(text, pageMargin + px2pt(13), y);
      return y + px2pt(12);
    }
    case "filled": {
      doc.setFont(fontFam, "bold");
      doc.setFontSize(fontSize);
      const textWidth = doc.getTextWidth(text);
      const padX = px2pt(12);
      const padY = px2pt(6);
      const boxW = textWidth + padX * 2;
      const boxH = fontSize + padY * 2;
      const [ar, ag, ab] = rgb255(accent);
      doc.setFillColor(ar, ag, ab);
      roundedRect(doc, pageMargin, y - fontSize, boxW, boxH, borderRadius, "F");
      doc.setTextColor(255, 255, 255);
      doc.text(text, pageMargin + padX, y + padY * 0.5);
      return y - fontSize + boxH + px2pt(12);
    }
    case "minimal": {
      doc.setFont(fontFam, "bold");
      doc.setFontSize(px2pt(12.8));
      const [pr, pg, pb] = rgb255(primary);
      doc.setTextColor(pr, pg, pb);
      doc.text(text, pageMargin, y, { charSpace: 1.2 });
      return y + px2pt(8);
    }
    default: {
      doc.setFont(fontFam, "bold");
      doc.setFontSize(fontSize);
      const [pr, pg, pb] = rgb255(primary);
      doc.setTextColor(pr, pg, pb);
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
  const { doc, palette, primary, spacing, activeLang, pageMargin, contentWidth, fontFam } = ctx;
  const translation = entry.translations.find((t) => t.language === activeLang);
  const title = sanitizeText(translation?.title ?? "");
  const organization = sanitizeText(translation?.organization ?? "");
  const description = sanitizeText(translation?.description ?? "");
  const year = entry.year;

  const titleFontSize = px2pt(15.2); // 0.95rem
  const bodyFontSize = px2pt(14);    // text-sm
  const yearFontSize = px2pt(12);    // text-xs

  if (title) {
    doc.setFont(fontFam, "bold");
    doc.setFontSize(titleFontSize);
    const [pr, pg, pb] = rgb255(primary);
    doc.setTextColor(pr, pg, pb);

    const yearText = year != null && year !== 0 ? String(year) : "";
    const yearW = yearText ? doc.getTextWidth(yearText) + px2pt(12) : 0;
    const titleMaxWidth = contentWidth - yearW;
    const titleLines = doc.splitTextToSize(title, titleMaxWidth) as string[];
    doc.text(titleLines, pageMargin, y);
    const titleBlockHeight = titleLines.length * titleFontSize;

    if (yearText) {
      doc.setFont(fontFam, "normal");
      doc.setFontSize(yearFontSize);
      const [mr, mg, mb] = rgb255(palette.muted);
      doc.setTextColor(mr, mg, mb);
      doc.text(yearText, pageMargin + contentWidth, y, { align: "right" });
    }

    y += titleBlockHeight;
  }

  if (organization) {
    doc.setFont(fontFam, "italic");
    doc.setFontSize(bodyFontSize);
    const [mr, mg, mb] = rgb255(palette.muted);
    doc.setTextColor(mr, mg, mb);
    const orgLines = doc.splitTextToSize(organization, contentWidth) as string[];
    doc.text(orgLines, pageMargin, y);
    y += orgLines.length * (bodyFontSize * 1.1);
  }

  if (description) {
    doc.setFont(fontFam, "italic");
    doc.setFontSize(bodyFontSize);
    const [tr, tg, tb] = rgb255(palette.text);
    doc.setTextColor(tr, tg, tb);
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
  const { doc, spacing, template, pageMargin, contentWidth } = ctx;

  const layout = section.layout_config as Record<string, unknown>;
  const twoCol =
    layout?.columns === "two" ? true :
    layout?.columns === "one" ? false :
    template.twoColumnDefault;

  y = renderHeading(ctx, sanitizeText(section.title), y);

  if (twoCol && section.entries.length > 1) {
    const mid = Math.ceil(section.entries.length / 2);
    const col1 = section.entries.slice(0, mid);
    const col2 = section.entries.slice(mid);
    const colGap = px2pt(spacing.item * 4);
    const colWidth = (contentWidth - colGap) / 2;

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
  } else {
    for (const entry of section.entries) {
      y = renderEntry(ctx, entry, y);
    }
  }

  y += px2pt(spacing.section);
  return y;
}

async function renderProfileHeader(
  ctx: RenderContext,
  data: PdfCVData
): Promise<number> {
  const { doc, palette, accent, primary, spacing, pageMargin, contentWidth, fontFam } = ctx;
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
      const [ar, ag, ab] = rgb255(accent);
      doc.setDrawColor(ar, ag, ab);
      doc.setLineWidth(1.5);
      doc.rect(photoX - 1.5, y - 1.5, photoSize + 3, photoSize + 3, "S");
      doc.setLineWidth(0.2);
    }

    await embedPhoto(doc, data.profilePicture, photoX, y, photoSize, photoSize);

    if (name) {
      doc.setFont(fontFam, "bold");
      doc.setFontSize(px2pt(28)); // 1.75rem
      const [pr, pg, pb] = rgb255(primary);
      doc.setTextColor(pr, pg, pb);
      doc.text(name, textX, y + px2pt(12));
    }

    if (title) {
      doc.setFont(fontFam, "normal");
      doc.setFontSize(px2pt(14));
      const [ar, ag, ab] = rgb255(accent);
      doc.setTextColor(ar, ag, ab);
      const titleY = name ? y + px2pt(28) : y + px2pt(14);
      doc.text(title.toUpperCase(), textX, titleY);
    }

    y += photoSize + px2pt(spacing.section);
  } else {
    if (name) {
      doc.setFont(fontFam, "bold");
      doc.setFontSize(px2pt(28));
      const [pr, pg, pb] = rgb255(primary);
      doc.setTextColor(pr, pg, pb);
      doc.text(name, pageMargin + contentWidth / 2, y + px2pt(12), { align: "center" });
    }
    if (title) {
      doc.setFont(fontFam, "normal");
      doc.setFontSize(px2pt(14));
      const [ar, ag, ab] = rgb255(accent);
      doc.setTextColor(ar, ag, ab);
      const titleY = name ? y + px2pt(28) : y + px2pt(14);
      doc.text(title.toUpperCase(), pageMargin + contentWidth / 2, titleY, { align: "center" });
    }
    y += px2pt(40) + px2pt(spacing.section);
  }

  // Divider line below header
  const [sr, sg, sb] = rgb255(palette.surface);
  doc.setDrawColor(sr, sg, sb);
  doc.setLineWidth(0.5);
  doc.line(pageMargin, y, pageMargin + contentWidth, y);
  doc.setLineWidth(0.2);
  y += px2pt(spacing.section);

  return y;
}

/** Estimate the height of a section for auto-pagination. */
function estimateSectionHeight(ctx: RenderContext, section: SectionWithEntries): number {
  const { doc, spacing, template, contentWidth, activeLang } = ctx;
  let h = px2pt(20);

  const layout = section.layout_config as Record<string, unknown>;
  const twoCol =
    layout?.columns === "two" ? true :
    layout?.columns === "one" ? false :
    template.twoColumnDefault;

  const estimateEntry = (entry: SectionWithEntries["entries"][0]): number => {
    const translation = entry.translations.find((t) => t.language === activeLang);
    const title = sanitizeText(translation?.title ?? "");
    const organization = sanitizeText(translation?.organization ?? "");
    const description = sanitizeText(translation?.description ?? "");
    let eh = 0;
    if (title) eh += px2pt(15.2);
    if (organization) eh += px2pt(14) * 1.1;
    if (description) {
      const lines = wrapText(doc, description, contentWidth);
      eh += lines.length * px2pt(14) * spacing.lineHeight;
    }
    eh += px2pt(spacing.item);
    return eh;
  };

  if (twoCol && section.entries.length > 1) {
    const mid = Math.ceil(section.entries.length / 2);
    const col1 = section.entries.slice(0, mid);
    const col2 = section.entries.slice(mid);
    let h1 = 0, h2 = 0;
    for (const e of col1) h1 += estimateEntry(e);
    for (const e of col2) h2 += estimateEntry(e);
    h += Math.max(h1, h2);
  } else {
    for (const e of section.entries) h += estimateEntry(e);
  }

  h += px2pt(spacing.section);
  return h;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Export a CV to a print-ready A4 PDF with vector graphics.
 *
 * All text, shapes, borders, and layout elements are rendered as native
 * PDF vector operations — text is selectable, lines are crisp at any zoom.
 * Only the profile photo (if present) is embedded as a raster image.
 *
 * @param _element  Kept for API compatibility with the old html2canvas version.
 *                  No longer used — rendering is entirely data-driven.
 * @param options   Export options including cvData (structured CV content).
 */
export async function exportToPdf(
  _element: HTMLElement,
  options: PdfExportOptions & { cvData?: PdfCVData } = {}
): Promise<void> {
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

  const pageWidthPt = doc.internal.pageSize.getWidth();
  const pageHeightPt = doc.internal.pageSize.getHeight();

  const design = data.design;
  const template = getTemplate(design.template ?? "clean");
  const palette = getPalette(
    (design.custom_config?.paletteId as string) ?? template.defaultPalette
  );
  const fontStack = getFontStack(design.font_family ?? template.defaultFont);
  const spacing = SPACING_VALUES[design.spacing ?? "normal"];
  const borderRadius = design.border_radius ?? 8;
  const pageMargin = px2pt(design.page_margin ?? 48);
  const accent = design.accent_color ?? palette.accent;
  const primary = design.primary_color ?? palette.primary;
  const profileRim = (design.custom_config?.profileRim as boolean) ?? true;
  const profileImagePosition = (design.custom_config?.profileImagePosition as string) ?? "left";
  const pageMarginColor = (design.custom_config?.marginColor as string) ?? palette.bg;

  const contentWidth = pageWidthPt - pageMargin * 2;

  // Map web fonts to jsPDF built-ins (helvetica for sans, times for serif)
  const serifKeywords = ["serif", "Georgia", "Garamond", "Lora", "Merriweather", "Crimson", "Playfair"];
  const isSerif = serifKeywords.some((kw) => fontStack.includes(kw));
  const fontFam = isSerif ? "times" : "helvetica";

  const ctx: RenderContext = {
    doc,
    palette,
    template,
    spacing,
    borderRadius,
    pageMargin,
    accent,
    primary,
    pageMarginColor,
    profileRim,
    profileImagePosition,
    activeLang: data.activeLang,
    contentWidth,
    pageHeightPt,
    pageWidthPt,
    fontFam,
  };

  // Filter enabled sections and entries
  const enabledSections = data.sections.filter((s) => s.is_enabled);
  const enabledSectionsWithEntries = enabledSections.map((s) => ({
    ...s,
    entries: s.entries.filter((e) => e.is_enabled),
  }));

  // Determine page distribution
  const useAutoPaginate = (data.pageBreaks ?? []).length === 0;
  let pageSections: SectionWithEntries[][];

  if (!useAutoPaginate) {
    const breaks = data.pageBreaks!;
    let start = 0;
    pageSections = [];
    for (const breakIdx of breaks) {
      pageSections.push(enabledSectionsWithEntries.slice(start, breakIdx));
      start = breakIdx;
    }
    pageSections.push(enabledSectionsWithEntries.slice(start));
  } else {
    const availableHeight = pageHeightPt - pageMargin * 2;

    let profileHeaderHeight = 0;
    if (data.profileName || data.profileTitle || data.profilePicture) {
      profileHeaderHeight = px2pt(96) + px2pt(spacing.section) * 2 + px2pt(16);
    }

    const sectionHeights = enabledSectionsWithEntries.map((s) =>
      estimateSectionHeight(ctx, s)
    );

    const pages: SectionWithEntries[][] = [];
    let currentPage: SectionWithEntries[] = [];
    let currentHeight = profileHeaderHeight;

    for (let i = 0; i < sectionHeights.length; i++) {
      const sh = sectionHeights[i];
      if (currentHeight + sh > availableHeight && currentPage.length > 0) {
        pages.push(currentPage);
        currentPage = [enabledSectionsWithEntries[i]];
        currentHeight = sh;
      } else {
        currentPage.push(enabledSectionsWithEntries[i]);
        currentHeight += sh;
      }
    }
    if (currentPage.length > 0) pages.push(currentPage);
    pageSections = pages.length > 0 ? pages : [enabledSectionsWithEntries];
  }

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

  doc.save(filename);
}