import type { SectionWithEntries, CVDesign } from "@/types/database";
import {
  getTemplate,
  SPACING_VALUES,
  PAGE_WIDTH,
  PAGE_HEIGHT,
  type TemplateConfig,
} from "@/lib/design-constants";

/**
 * ONE shared flow-layout model for the CV preview (DOM) and the PDF exporter
 * (jsPDF) — REPORT.md §4 Step 6.
 *
 * Historically THREE independent layout models coexisted: the preview's
 * measured DOM tree, the preview's own pagination accumulator, and the
 * exporter's constant table (flowLayout/headingAdvancePt/
 * profileHeaderHeightPt/measureEntry). They drifted apart (the measured
 * max|Δy| was 196.6 px); every fix had to be applied twice.
 *
 * This module is now the ONLY owner of:
 *   - the flow STRUCTURE (header / heading / entry / section-tail /
 *     two-column chunk blocks, in flow order),
 *   - the GAP arithmetic (CSS margin collapsing at section ends, section
 *     tails, tight continuation gaps, two-column column steps),
 *   - the pure-constant heights (heading boxes per style, profile-header
 *     box),
 *   - the PAGINATION rules (keep-with-next, user page-break-before, the
 *     ink-box fit test, two-column chunk splitting, continuation marking).
 *
 * The only thing it cannot own is raw text measurement (wrap counts /
 * entry ink boxes), because that is inherently per-engine: the preview
 * measures the real DOM, the exporter measures with jsPDF's embedded
 * fonts. Consumers inject exactly that through `FlowMeasure` and NOTHING
 * else — every number this module adds up comes from `design-constants.ts`
 * (PAGE_WIDTH/HEIGHT, page_margin, spacing) or from the injected measure.
 *
 * All values are CSS px (1 px = 0.75 pt); the exporter renders the plan
 * through px2pt().
 */

export type CvEntry = SectionWithEntries["entries"][0];

// ─── Shared text hygiene (ONE owner; preview + exporter import this) ─────────

/** Strip whitespace / collapse accidental blank lines exactly like the
 *  preview's and the exporter's renderers do. */
export function sanitizeFlowText(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── Geometry — design-constants.ts is the single numeric source ────────────

export function pageMarginPx(design: Partial<CVDesign>): number {
  return design.page_margin ?? 48;
}

/** Width of the page's content box (= the preview's content div / measure
 *  container width). */
export function contentBoxWidthPx(design: Partial<CVDesign>): number {
  return PAGE_WIDTH - pageMarginPx(design) * 2;
}

/** Height of the page's content box — the pagination bound. Content-relative:
 * the accumulator starts at 0 = the content box top (y = pageMargin on the
 * page), so the bound is the content BOX height, never PAGE_HEIGHT − one
 * margin. */
export function contentBoxHeightPx(design: Partial<CVDesign>): number {
  return PAGE_HEIGHT - pageMarginPx(design) * 2;
}

/** Horizontal gap between the two columns of a two-column section. */
export function flowColGapPx(design: Partial<CVDesign>): number {
  return SPACING_VALUES[design.spacing ?? "normal"].item * 4;
}

/** Width of ONE column of a two-column section. */
export function flowColWidthPx(design: Partial<CVDesign>): number {
  return (contentBoxWidthPx(design) - flowColGapPx(design)) / 2;
}

/** Two-column decision: explicit layout_config.columns wins over the
 *  template's default. ONE owner — both renderers and the flow model read
 *  this, never a second copy of the fallback chain. */
export function isTwoColumnSection(
  section: SectionWithEntries,
  template: TemplateConfig
): boolean {
  const layout = section.layout_config as Record<string, unknown> | null;
  if (layout?.columns === "two") return true;
  if (layout?.columns === "one") return false;
  return template.twoColumnDefault;
}

/** Global heading-style override (custom_config.headingStyle, "auto" =
 *  template default) — ONE owner for the preview's renderHeading, the
 *  exporter's renderHeading and this module's heading box. */
export function resolveHeadingStyle(
  design: Partial<CVDesign>,
  template: TemplateConfig
): TemplateConfig["headingStyle"] {
  const override = (design.custom_config?.headingStyle as string) ?? "auto";
  return override === "auto"
    ? template.headingStyle
    : (override as TemplateConfig["headingStyle"]);
}

// ─── End-of-CV contact block (bottom margin band, OUTSIDE the flow) ──────────

/** One printed contact line (phone or e-mail). */
export interface ContactLine {
  kind: "phone" | "email";
  text: string;
}

/** Font size of a contact line (12 px = 9 pt) at SINGLE line-height —
 *  ONE owner: the preview's margin-band block and the exporter's band
 *  drawing both size their 12 px struts from this constant. */
export const CONTACT_LINE_PX = 12;

/**
 * Read the end-of-CV contact block config from custom_config (keys
 * contact_phone / contact_email / contact_show_phone / contact_show_email).
 * A line is printed ONLY when its own checkbox flag is true AND its value
 * sanitizes non-empty — a missing key or an empty string behaves exactly
 * like an unchecked box, so "both off" and "both empty" are the same
 * state: nothing renders, anywhere. Phone first, e-mail second.
 * The block itself is NOT flow: it lives in the bottom page-margin band,
 * consumes no content height and never joins pagination.
 */
export function contactLines(design: Partial<CVDesign>): ContactLine[] {
  const cfg = (design.custom_config ?? {}) as Record<string, unknown>;
  const read = (v: unknown): string =>
    sanitizeFlowText(typeof v === "string" ? v : "");
  const phone = read(cfg.contact_phone);
  const email = read(cfg.contact_email);
  const lines: ContactLine[] = [];
  if (cfg.contact_show_phone === true && phone) {
    lines.push({ kind: "phone", text: phone });
  }
  if (cfg.contact_show_email === true && email) {
    lines.push({ kind: "email", text: email });
  }
  return lines;
}

// ─── Flow blocks ─────────────────────────────────────────────────────────────

export type FlowBlockKind =
  | "header"
  | "heading"
  | "entry"
  | "sectionTail"
  | "twocolChunk";

/** One two-column entry: its ink box plus the placement STEP within a column
 *  stack (box + spacing.item — margins of flex items stay INSIDE the column
 *  box, DOM-measured: column.bottom − lastEntry.bottom = spacing.item). */
export interface FlowChunkItem {
  entry: CvEntry;
  /** Ink-box height, CSS px (no trailing gap). */
  boxPx: number;
  /** Advance to the next entry's top inside the column, CSS px. */
  stepPx: number;
}

export interface FlowChunk {
  left: FlowChunkItem[];
  right: FlowChunkItem[];
}

export interface FlowBlock {
  kind: FlowBlockKind;
  /** The block's own ink-box height, CSS px (trailing gap excluded). */
  heightPx: number;
  /** Collapsed gap AFTER this block (to the next block's top), CSS px. */
  gapAfterPx: number;
  /** Stable identity: "header" | "<section>:heading" | "<section>:<entry>"
   *  | "<section>:chunk" | "<section>:tail". */
  key: string;
  sectionId?: string;
  /** entry blocks: the entry itself. */
  entry?: CvEntry;
  /** heading blocks: resolved, sanitized section title. */
  title?: string;
  /** heading blocks: the (auto-shrunk-or-base) font size the injected
   *  measure resolved — renderers draw at exactly this size. */
  fontSizePx?: number;
  /** twocolChunk blocks: the per-column stacks. */
  chunk?: FlowChunk;
  /** heading blocks: user-forced page break before this section. */
  pageBreakBefore?: boolean;
  /** sectionTail blocks: the gap to use when the section SPLIT across pages
   *  (the DOM renders a continuation group with a tight spacing.item wrapper
   *  margin instead of the section gap). */
  continuationGapPx?: number;
}

/** Per-engine raw text measurement — the ONLY injected dependency. */
export interface FlowMeasure {
  /** Ink-box height of one entry at a given column width, CSS px, WITHOUT
   *  any trailing gap (this module owns all gap arithmetic). */
  entryBoxPx(entry: CvEntry, widthPx: number): number;
  /** Heading font size after the auto-shrink rule (or the base size when the
   *  title fits). Engines measure text width their own way; the module owns
   *  the box/margin constants that turn the size into a height. */
  headingFontSizePx(title: string, basePx: number, padPx: number): number;
}

export interface FlowProfile {
  name: string;
  title: string;
  /** Whether the header renders a photo (the exporter's includePhoto=false
   *  paginates WITHOUT the photo — exactly what it renders). */
  hasPhoto: boolean;
}

// ─── Profile header (no-photo struts, probe-verified) ───────────────────────

/** Title div (0.875rem at preflight lh 1.5) — also used by the exporter's
 *  no-photo header baseline anchor. */
export const HEADER_TITLE_STRUT_PX = 21;
/** Name h1: 28px at lh 1.2. */
const NAME_STRUT_PX = 33.6;
/** Name h1's marginBottom. */
const NAME_MARGIN_PX = 4;
/** Photo box (border-box: the 2px rim is inside the 96px). */
const PHOTO_PX = 96;

function profileHeaderBoxPx(profile: FlowProfile): number {
  const hasName = Boolean(sanitizeFlowText(profile.name));
  const hasTitle = Boolean(sanitizeFlowText(profile.title));
  if (!hasName && !hasTitle && !profile.hasPhoto) return 0;
  if (profile.hasPhoto) return PHOTO_PX;
  if (hasName && hasTitle) return NAME_STRUT_PX + NAME_MARGIN_PX + HEADER_TITLE_STRUT_PX;
  if (hasName) return NAME_STRUT_PX;
  return HEADER_TITLE_STRUT_PX;
}

// ─── Headings (h2 strut = fontSize × 1.5, preflight — preset-independent) ───

interface HeadingStyleGeom {
  baseFsPx: number;
  /** Horizontal padding the auto-shrink must leave free (border-left +
   *  padding for "border", px-3 for "filled"). */
  padPx: number;
  /** The h2's own margin-bottom (mb-3 / mb-2). */
  marginPx: number;
}

function headingStyleGeom(style: string): HeadingStyleGeom {
  switch (style) {
    case "underline": return { baseFsPx: 18, padPx: 0, marginPx: 12 };
    case "border": return { baseFsPx: 18, padPx: 13, marginPx: 12 };
    case "filled": return { baseFsPx: 18, padPx: 12, marginPx: 12 };
    case "minimal": return { baseFsPx: 16, padPx: 0, marginPx: 8 };
    default: return { baseFsPx: 14, padPx: 0, marginPx: 0 };
  }
}

/** Heading ink box (strut + style chrome, no margin). */
function headingBoxPx(style: string, fsPx: number): number {
  const strut = fsPx * 1.5;
  switch (style) {
    case "underline": return strut + 4 + 2; // paddingBottom 4 + border 2
    case "border": return strut;
    case "filled": return strut + 6 * 2; // py-1.5
    case "minimal": return strut;
    default: return 21;
  }
}

// ─── computeFlowBlocks ───────────────────────────────────────────────────────

export interface ComputeFlowOptions {
  profile: FlowProfile;
  measure: FlowMeasure;
}

/**
 * Build the flow block list (CSS px). Block semantics:
 *   header        profile header box (photo or text struts), gap = section
 *   heading       heading box (per style), gap = its own margin-bottom
 *   entry         entry ink box, gap = spacing.item (mid-section) or the
 *                 collapsed remainder max(0, item − section) at a section end
 *   twocolChunk   ONE block per two-column section; height = max(left, right)
 *                 column stacks; the trailing item gaps stay INSIDE the
 *                 columns (flex items' margins don't collapse through)
 *   sectionTail   pure-gap block: the wrapper's trailing spacing.section
 *
 * An EMPTY section emits only its heading, with gap = max(margin, section):
 * the h2 is the wrapper's last child, so its margin-bottom collapses with
 * the wrapper's spacing.section (parent-child through-collapse).
 *
 * The flow's last margin collapses out of the content box (scrollHeight
 * semantics), so trailing tails are dropped and the final block's gap is 0
 * — Σ(heightPx + gapAfterPx) equals the browser content height exactly.
 */
export function computeFlowBlocks(
  sections: SectionWithEntries[],
  design: Partial<CVDesign>,
  lang: string,
  opts: ComputeFlowOptions
): FlowBlock[] {
  const template = getTemplate(design.template ?? "clean");
  const headingStyle = resolveHeadingStyle(design, template);
  const spacing = SPACING_VALUES[design.spacing ?? "normal"];
  const itemPx = spacing.item;
  const sectionPx = spacing.section;
  const contentW = contentBoxWidthPx(design);
  const colW = flowColWidthPx(design);
  const { profile, measure } = opts;

  const blocks: FlowBlock[] = [];

  // ── Profile header ──────────────────────────────────────────────────────
  const headerBox = profileHeaderBoxPx(profile);
  if (headerBox > 0) {
    blocks.push({
      kind: "header",
      heightPx: headerBox,
      gapAfterPx: sectionPx,
      key: "header",
    });
  }

  for (const section of sections) {
    const layout = section.layout_config as Record<string, unknown> | null;
    const titleMap = layout?.sectionTitleTranslations as
      | Record<string, string>
      | undefined;
    // Active-language section title: translated title wins when non-empty,
    // otherwise the original section title.
    const sectionTitle =
      (titleMap && titleMap[lang]) || sanitizeFlowText(section.title);
    const geom = headingStyleGeom(headingStyle);
    const fsPx = measure.headingFontSizePx(sectionTitle, geom.baseFsPx, geom.padPx);
    const headingBlock: FlowBlock = {
      kind: "heading",
      heightPx: headingBoxPx(headingStyle, fsPx),
      gapAfterPx: geom.marginPx,
      key: `${section.id}:heading`,
      sectionId: section.id,
      title: sectionTitle,
      fontSizePx: fsPx,
      pageBreakBefore: layout?.page_break_before === true,
    };

    const entries = section.entries;

    if (entries.length === 0) {
      // Empty section: the h2's own margin-bottom collapses with the
      // wrapper's trailing spacing.section — ONE gap of max(margin, section),
      // no tail block, nothing else to lay out.
      headingBlock.gapAfterPx = Math.max(geom.marginPx, sectionPx);
      blocks.push(headingBlock);
      continue;
    }

    blocks.push(headingBlock);

    if (isTwoColumnSection(section, template) && entries.length > 1) {
      // Sequential halves (the classic split): left column takes the first
      // ⌈n/2⌉ entries, right the rest. Columns are INDEPENDENT stacks, not a
      // row-aligned grid — the chunk's height is the taller stack.
      const half = Math.ceil(entries.length / 2);
      const mk = (entry: CvEntry): FlowChunkItem => {
        const boxPx = measure.entryBoxPx(entry, colW);
        return { entry, boxPx, stepPx: boxPx + itemPx };
      };
      const left = entries.slice(0, half).map(mk);
      const right = entries.slice(half).map(mk);
      const hL = left.reduce((a, c) => a + c.stepPx, 0);
      const hR = right.reduce((a, c) => a + c.stepPx, 0);
      blocks.push({
        kind: "twocolChunk",
        heightPx: Math.max(hL, hR, 0),
        gapAfterPx: 0,
        key: `${section.id}:chunk`,
        sectionId: section.id,
        chunk: { left, right },
      });
    } else {
      const lastIdx = entries.length - 1;
      entries.forEach((entry, i) => {
        blocks.push({
          kind: "entry",
          heightPx: measure.entryBoxPx(entry, contentW),
          // Single-column section end: the entry's spacing.item and the
          // wrapper's spacing.section are adjacent margins that collapse to
          // max(item, section); the section tail block carries the section
          // side, so the entry contributes only max(0, item − section).
          gapAfterPx: i === lastIdx ? Math.max(0, itemPx - sectionPx) : itemPx,
          key: `${section.id}:${entry.id}`,
          sectionId: section.id,
          entry,
        });
      });
    }

    // Section tail: the wrapper's trailing spacing.section. A pure-gap
    // block — paginate() drops it at page ends (dead space) and swaps it for
    // the continuation gap when the section split across pages.
    blocks.push({
      kind: "sectionTail",
      heightPx: 0,
      gapAfterPx: sectionPx,
      continuationGapPx: itemPx,
      key: `${section.id}:tail`,
      sectionId: section.id,
    });
  }

  // Trailing dead space: drop trailing tails and zero the final gap so the
  // sum equals the browser content height (trailing margins collapse out of
  // the content box). Nothing follows the last block, so the gap is inert
  // for pagination too.
  while (
    blocks.length > 0 &&
    blocks[blocks.length - 1].kind === "sectionTail"
  ) {
    blocks.pop();
  }
  if (blocks.length > 0) {
    blocks[blocks.length - 1].gapAfterPx = 0;
  }

  return blocks;
}

// ─── paginate ───────────────────────────────────────────────────────────────

export interface PlacedFlowBlock {
  pageIndex: number;
  /** Content-relative top of the block on its page, CSS px. */
  topPx: number;
  block: FlowBlock;
  /** Effective chunk columns on this page (twocolChunk blocks only — a split
   *  chunk appears on two pages with different column prefixes). */
  chunk?: FlowChunk;
  /** This block's section continues from a previous page (no heading on this
   *  page) — groupPlacements marks the group isContinuation from this. */
  continuation?: boolean;
}

/**
 * Distribute flow blocks across pages. Rules (the preview's DOM-true set —
 * the exporter inherits them, replacing its charge-model + trailing-gap
 * waiver with the exact equivalent):
 *
 *   R0  Pure-flow fit: a block stays on the page when its own INK BOX fits
 *       the content box (accumulator + box ≤ contentHeight). Its trailing
 *       gap is invisible dead space at a page end — never a reason to break.
 *   R1  Keep-with-next: a page must never END with a heading; the heading
 *       must bring at least its first body item (empty sections chain
 *       through following headings; a two-column block only needs its first
 *       placeable entry per the split rule).
 *   R2  User-forced break: layout_config.page_break_before starts the
 *       section on a fresh page (never on an empty page).
 *   R3  sectionTail is a pure gap: it never breaks a page; when its section
 *       SPLIT across pages it shrinks to the tight continuation gap
 *       (spacing.item — the DOM's continuation wrapper margin).
 *   R4  Two-column chunks split per column: fill each column's prefix up to
 *       the free height; the independent remainders continue on the next
 *       page as a continuation chunk (no row re-alignment).
 */
export function paginate(
  blocks: FlowBlock[],
  contentHeightPx: number
): PlacedFlowBlock[] {
  const placed: PlacedFlowBlock[] = [];
  const sectionSplit = new Set<string>();
  const headingPage = new Map<string, number>();
  let pageIndex = 0;
  let top = 0; // content-relative top of the NEXT block
  let pageHasInk = false;

  const flush = () => {
    pageIndex += 1;
    top = 0;
    pageHasInk = false;
  };

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];

    // R3 — pure gap: never breaks a page by itself.
    if (b.kind === "sectionTail" && b.sectionId != null) {
      const gap = sectionSplit.has(b.sectionId)
        ? b.continuationGapPx ?? b.gapAfterPx
        : b.gapAfterPx;
      placed.push({ pageIndex, topPx: top, block: b });
      top += gap;
      continue;
    }

    // R2 — user-forced fresh page (only when the current page has ink).
    if (b.pageBreakBefore && pageHasInk) {
      flush();
    }

    // R1 — keep-with-next.
    if (b.kind === "heading" && pageHasInk) {
      let keep = b.heightPx + b.gapAfterPx;
      let j = i + 1;
      while (j < blocks.length && blocks[j].kind === "heading") {
        keep += blocks[j].heightPx + blocks[j].gapAfterPx;
        j++;
      }
      if (j < blocks.length) {
        const nb = blocks[j];
        if (nb.chunk) {
          // The block splits per column, so the first PLACEABLE entry
          // beside the heading is all the rule needs.
          const firsts: number[] = [];
          if (nb.chunk.left.length > 0) firsts.push(nb.chunk.left[0].stepPx);
          if (nb.chunk.right.length > 0) firsts.push(nb.chunk.right[0].stepPx);
          keep += firsts.length > 0 ? Math.min(...firsts) : nb.heightPx;
        } else {
          keep += nb.heightPx;
        }
      }
      if (top + keep > contentHeightPx) {
        flush();
      }
    }

    // R0 — pure-flow fit; R4 — two-column split.
    if (top + b.heightPx > contentHeightPx && pageHasInk) {
      if (b.kind === "twocolChunk" && b.chunk && b.sectionId != null) {
        const fillCol = (col: FlowChunkItem[], free: number) => {
          const placedC: FlowChunkItem[] = [];
          const rest: FlowChunkItem[] = [];
          let h = 0;
          for (const it of col) {
            if (h + it.stepPx <= free) {
              placedC.push(it);
              h += it.stepPx;
            } else {
              rest.push(it);
            }
          }
          return { placedC, rest, h };
        };
        const free = contentHeightPx - top;
        const L = fillCol(b.chunk.left, free);
        const R = fillCol(b.chunk.right, free);
        if (
          L.placedC.length + R.placedC.length > 0 &&
          L.rest.length + R.rest.length > 0
        ) {
          // Page N: existing blocks + the per-column fitted prefixes.
          placed.push({
            pageIndex,
            topPx: top,
            block: b,
            chunk: { left: L.placedC, right: R.placedC },
          });
          flush();
          sectionSplit.add(b.sectionId);
          // Fresh page: the independent remainders as a continuation chunk.
          // The remainders may STILL be taller than a full page (a two-column
          // section spanning 3+ pages) — keep splitting per column: each
          // pass places what fits the fresh page and re-flushes; the final
          // rest (≤ one page) stays as the continuation chunk. The old
          // engines placed an over-tall remainder unconditionally — the
          // preview silently clipped it (overflow:hidden) and the PDF drew
          // into the bottom margin ring. One owner now, one rule.
          let curL = L.rest;
          let curR = R.rest;
          for (;;) {
            const fL = fillCol(curL, contentHeightPx);
            const fR = fillCol(curR, contentHeightPx);
            const restLeft =
              fL.rest.length + fR.rest.length === 0 ||
              fL.placedC.length + fR.placedC.length === 0;
            placed.push({
              pageIndex,
              topPx: 0,
              block: b,
              chunk: restLeft
                ? { left: curL, right: curR }
                : { left: fL.placedC, right: fR.placedC },
              continuation: true,
            });
            if (restLeft) {
              top = Math.max(
                curL.reduce((a, c) => a + c.stepPx, 0),
                curR.reduce((a, c) => a + c.stepPx, 0),
                0
              );
              pageHasInk = true;
              break;
            }
            flush();
            curL = fL.rest;
            curR = fR.rest;
          }
          continue;
        }
      }
      // Generic break: flush and retry on the fresh page. When the break
      // lands INSIDE a section (a non-heading block), the rows that follow
      // form a continuation group and the section's tail shrinks (R3).
      if (b.kind !== "heading" && b.sectionId != null) {
        sectionSplit.add(b.sectionId);
      }
      flush();
    }

    if (b.kind === "heading" && b.sectionId != null) {
      headingPage.set(b.sectionId, pageIndex);
    }

    placed.push({
      pageIndex,
      topPx: top,
      block: b,
      chunk: b.chunk,
      continuation:
        (b.kind === "entry" || b.kind === "twocolChunk") &&
        b.sectionId != null &&
        headingPage.get(b.sectionId) !== pageIndex,
    });
    top += b.heightPx + b.gapAfterPx;
    pageHasInk = true;
  }

  return placed;
}

// ─── Page groups ────────────────────────────────────────────────────────────

/**
 * Convert placed blocks back into per-page section groups — the shape both
 * renderers consume ({ ...section, entries } with `twocolChunks` metadata on
 * two-column groups and `isContinuation` on groups whose heading is on an
 * earlier page). Mirrors the old duplicated flush() logic of BOTH engines,
 * now in one place.
 */
export function groupPlacements(
  placed: PlacedFlowBlock[],
  sections: SectionWithEntries[]
): SectionWithEntries[][] {
  if (placed.length === 0) return [];
  const byId = new Map(sections.map((s) => [s.id, s]));

  interface Rec {
    group: SectionWithEntries;
    hasHeading: boolean;
  }
  const pageMaps: Map<string, Rec>[] = [];
  const pageOrder: string[][] = [];

  for (const p of placed) {
    const b = p.block;
    if (b.kind === "header" || b.kind === "sectionTail") continue;
    if (b.sectionId == null) continue;
    const page = p.pageIndex;
    while (pageMaps.length <= page) {
      pageMaps.push(new Map());
      pageOrder.push([]);
    }
    let rec = pageMaps[page].get(b.sectionId);
    if (!rec) {
      const src = byId.get(b.sectionId);
      if (!src) continue;
      const group: SectionWithEntries = { ...src, entries: [] };
      rec = { group, hasHeading: false };
      pageMaps[page].set(b.sectionId, rec);
      pageOrder[page].push(b.sectionId);
    }
    if (b.kind === "heading") {
      rec.hasHeading = true;
    } else if (b.kind === "entry" && b.entry) {
      rec.group.entries.push(b.entry);
    } else if (b.kind === "twocolChunk" && p.chunk) {
      const meta = rec.group as SectionWithEntries & {
        twocolChunks?: Array<{
          left: CvEntry[];
          right: CvEntry[];
        }>;
      };
      if (!meta.twocolChunks) meta.twocolChunks = [];
      meta.twocolChunks.push({
        left: p.chunk.left.map((c) => c.entry),
        right: p.chunk.right.map((c) => c.entry),
      });
      rec.group.entries.push(
        ...p.chunk.left.map((c) => c.entry),
        ...p.chunk.right.map((c) => c.entry)
      );
    }
  }

  const pages: SectionWithEntries[][] = pageOrder.map((order, page) =>
    order.map((id) => {
      const rec = pageMaps[page].get(id)!;
      if (!rec.hasHeading) {
        (rec.group as SectionWithEntries & { isContinuation?: boolean }).isContinuation = true;
      }
      return rec.group;
    })
  );
  return pages;
}
