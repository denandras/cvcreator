"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import type { SectionWithEntries, CVDesign } from "@/types/database";
import {
  getFontStack,
  getTemplate,
  getPalette,
  SPACING_VALUES,
  PAGE_WIDTH,
  PAGE_HEIGHT,
} from "@/lib/design-constants";

interface CVPreviewProps {
  sections: SectionWithEntries[];
  design: Partial<CVDesign>;
  activeLang: string;
  pageBreaks?: number[];
  profileName?: string;
  profileTitle?: string;
  showPageBreaks?: boolean;
  profilePicture?: string | null;
}

export function CVPreview({
  sections,
  design,
  activeLang,
  pageBreaks = [],
  profileName = "",
  profileTitle = "",
  showPageBreaks = false,
  profilePicture = null,
}: CVPreviewProps) {
  const template = getTemplate(design.template ?? "clean");
  const palette = getPalette(
    (design.custom_config?.paletteId as string) ?? template.defaultPalette
  );
  const fontStack = getFontStack(design.font_family ?? template.defaultFont);
  const spacing = SPACING_VALUES[design.spacing ?? "normal"];
  const borderRadius = design.border_radius ?? 8;
  const pageMargin = design.page_margin ?? 48;
  const accent = design.accent_color ?? palette.accent;
  const primary = design.primary_color ?? palette.primary;
  const profileRim = (design.custom_config?.profileRim as boolean) ?? true;
  const profileRadius = (design.custom_config?.profileRadius as number) ?? 48;
  // Profile image position: "left" (default) or "right"
  const profileImagePosition = (design.custom_config?.profileImagePosition as string) ?? "left";
  // Per-role color overrides — custom values win over the palette
  const pageMarginColor = (design.custom_config?.marginColor as string) ?? palette.bg;
  const textColor = (design.custom_config?.textColor as string) ?? palette.text;
  const mutedColor = (design.custom_config?.mutedColor as string) ?? palette.muted;
  const subtitleColor =
    (design.custom_config?.subtitleColor as string) ??
    design.accent_color ??
    palette.accent;
  const surfaceColor = (design.custom_config?.surfaceColor as string) ?? palette.surface;

  // Auto-pagination state
  const [autoPages, setAutoPages] = useState<SectionWithEntries[][]>([]);
  const measureRef = useRef<HTMLDivElement>(null);
  // Canvas for measuring heading text width (auto-fit size)
  const fitCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Filter enabled sections and entries
  const enabledSections = sections.filter((s) => s.is_enabled);
  const enabledSectionsWithEntries = enabledSections.map((s) => ({
    ...s,
    entries: s.entries.filter((e) => e.is_enabled),
  }));

  // Determine which sections are two-column
  const isTwoColumn = (section: SectionWithEntries) => {
    const layout = section.layout_config as Record<string, unknown>;
    if (layout?.columns === "two") return true;
    if (layout?.columns === "one") return false;
    return template.twoColumnDefault;
  };

  // Heading renderer
  const headingStyle = template.headingStyle;

  const renderHeading = (title: string) => {
    // Bigger section titles: base size grew from 0.875rem; auto-shrink only
    // when the measured title would exceed the content width.
    const fitPx = (basePx: number, padPx: number): number => {
      if (!title || typeof document === "undefined") return basePx;
      if (!fitCanvasRef.current) fitCanvasRef.current = document.createElement("canvas");
      const c = fitCanvasRef.current.getContext("2d");
      if (!c) return basePx;
      c.font = `700 ${basePx}px ${fontStack}`;
      const textW = c.measureText(title.toUpperCase()).width * 1.08; // tracking safety
      const avail = PAGE_WIDTH - pageMargin * 2 - padPx * 2;
      if (textW > avail && textW > 0) return Math.max(12, Math.floor((basePx * avail) / textW));
      return basePx;
    };
    switch (headingStyle) {
      case "underline":
        return (
          <h2
            className="uppercase tracking-wide font-bold mb-3"
            style={{
              fontSize: `${fitPx(18, 0)}px`,
              color: primary,
              borderBottom: `2px solid ${accent}`,
              paddingBottom: "4px",
            }}
          >
            {title}
          </h2>
        );
      case "border":
        return (
          <h2
            className="uppercase tracking-wider font-bold mb-3"
            style={{
              fontSize: `${fitPx(18, 13)}px`,
              color: primary,
              borderLeft: `3px solid ${accent}`,
              paddingLeft: "10px",
            }}
          >
            {title}
          </h2>
        );
      case "filled":
        return (
          <h2
            className="uppercase tracking-wider font-bold mb-3 px-3 py-1.5"
            style={{
              fontSize: `${fitPx(18, 12)}px`,
              color: readableOn(accent),
              backgroundColor: accent,
              borderRadius: `${borderRadius}px`,
              display: "inline-block",
            }}
          >
            {title}
          </h2>
        );
      case "minimal":
        return (
          <h2
            className="uppercase tracking-widest font-semibold mb-2"
            style={{
              fontSize: `${fitPx(16, 0)}px`,
              color: primary,
              letterSpacing: "0.15em",
            }}
          >
            {title}
          </h2>
        );
      default:
        return <h2 className="font-bold">{title}</h2>;
    }
  };

  /**
   * Sanitize text for PDF-safe rendering:
   * - Trim leading/trailing whitespace (removes accidental newlines at edges)
   * - Collapse 3+ consecutive newlines into 2 (preserves intentional paragraph
   *   breaks, removes accidental extra blank lines from textarea input)
   * - Collapse runs of spaces/tabs into a single space (prevents wide gaps
   *   from indentation or copy-paste)
   * Does NOT remove intentional single newlines (user pressed Enter once).
   */
  const sanitizeText = (text: string): string =>
    text
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  /** Relative luminance (WCAG) — picks readable white/black text on accents */
  const readableOn = (bg: string): string => {
    const hex = bg.trim();
    let r = 0, g = 0, b = 0;
    if (hex.startsWith("#")) {
      let body = hex.slice(1);
      if (body.length === 3) body = body[0] + body[0] + body[1] + body[1] + body[2] + body[2];
      if (body.length >= 6) {
        r = parseInt(body.slice(0, 2), 16);
        g = parseInt(body.slice(2, 4), 16);
        b = parseInt(body.slice(4, 6), 16);
      }
    }
    const lin = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return lum > 0.18 ? "#1a1a1a" : "#ffffff";
  };

  const renderEntry = (entry: SectionWithEntries["entries"][0]) => {
    const translation = entry.translations.find((t) => t.language === activeLang);
    const title = sanitizeText(translation?.title ?? "");
    const organization = sanitizeText(translation?.organization ?? "");
    const description = sanitizeText(translation?.description ?? "");
    const year = entry.year;

    return (
      <div
        key={entry.id}
        style={{ marginBottom: `${spacing.item}px`, lineHeight: spacing.lineHeight, breakInside: "avoid" }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-semibold" style={{ color: primary, fontSize: "0.95rem" }}>
            {title}
          </span>
          {year != null && year !== 0 && (
            <span className="text-xs font-medium whitespace-nowrap" style={{ color: mutedColor }}>
              {year}
            </span>
          )}
        </div>
        {organization && (
          <div className="text-sm italic" style={{ color: mutedColor }}>
            {organization}
          </div>
        )}
        {description && (
          <div className="text-sm italic mt-1" style={{ color: textColor, whiteSpace: "pre-line" }}>
            {description}
          </div>
        )}
      </div>
    );
  };

  const renderSection = (section: SectionWithEntries) => {
    const twoCol = isTwoColumn(section);
    const isContinuation = (section as SectionWithEntries & { isContinuation?: boolean }).isContinuation === true;
    const meta = section as SectionWithEntries & { twoColCounts?: { c1: number; c2: number } };
    const isMidSectionChunk = isContinuation && meta.twoColCounts !== undefined;
    return (
      <div
        key={section.id}
        style={{
          marginBottom: isMidSectionChunk
            ? `${spacing.item + 2}px`
            : isContinuation
              ? `${spacing.item}px`
              : `${spacing.section}px`,
          breakInside: "avoid",
        }}
      >
        {!isContinuation && renderHeading(sanitizeText(section.title))}
        {twoCol ? (
          (() => {
            const counts = meta.twoColCounts;
            const splitAt = counts
              ? counts.c1
              : Math.ceil(section.entries.length / 2);
            const col1 = section.entries.slice(0, splitAt);
            const col2 = section.entries.slice(splitAt);
            return (
              <div style={{ display: "flex", gap: `${spacing.item * 4}px` }}>
                <div style={{ flex: 1 }}>{col1.map(renderEntry)}</div>
                <div style={{ flex: 1 }}>{col2.map(renderEntry)}</div>
              </div>
            );
          })()
        ) : (
          <div>{section.entries.map(renderEntry)}</div>
        )}
      </div>
    );
  };

  // Profile header renderer — supports left/right image position
  const renderProfileHeader = () => {
    const safeName = sanitizeText(profileName);
    const safeTitle = sanitizeText(profileTitle);
    if (!safeName && !safeTitle && !profilePicture) return null;
    const isRight = profileImagePosition === "right";
    return (
      <>
        <div style={{ marginBottom: `${spacing.section}px` }} className="flex items-center gap-4">
          {profilePicture && !isRight && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profilePicture}
              alt="Profile"
              crossOrigin="anonymous"
              style={{
                width: "96px",
                height: "96px",
                objectFit: "cover",
                borderRadius: `${profileRadius}px`,
                flexShrink: 0,
                border: profileRim ? `2px solid ${accent}` : "none",
              }}
            />
          )}
          <div style={{ textAlign: profilePicture ? "left" : "center", flex: 1 }}>
            {safeName && (
              <h1
                className="font-bold"
                style={{
                  fontSize: "1.75rem",
                  color: primary,
                  marginBottom: "4px",
                  letterSpacing: "-0.02em",
                }}
              >
                {safeName}
              </h1>
            )}
            {safeTitle && (
              <div
                className="uppercase tracking-wider"
                style={{
                  fontSize: "0.875rem",
                  color: subtitleColor,
                  fontWeight: 500,
                  letterSpacing: "0.1em",
                }}
              >
                {safeTitle}
              </div>
            )}
          </div>
          {profilePicture && isRight && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profilePicture}
              alt="Profile"
              crossOrigin="anonymous"
              style={{
                width: "96px",
                height: "96px",
                objectFit: "cover",
                borderRadius: `${profileRadius}px`,
                flexShrink: 0,
                border: profileRim ? `2px solid ${accent}` : "none",
              }}
            />
          )}
          {!profilePicture && (
            <div
              style={{
                marginTop: "12px",
                borderBottom: `1px solid ${surfaceColor}`,
              }}
            />
          )}
        </div>
        {profilePicture && (safeName || safeTitle) && (
          <div
            style={{
              marginBottom: `${spacing.section}px`,
              borderBottom: `1px solid ${surfaceColor}`,
            }}
          />
        )}
      </>
    );
  };

  // Build pages from manual page breaks
  const manualPages: SectionWithEntries[][] = [];
  if (pageBreaks.length === 0) {
    manualPages.push(enabledSectionsWithEntries);
  } else {
    let start = 0;
    for (const breakIdx of pageBreaks) {
      manualPages.push(enabledSectionsWithEntries.slice(start, breakIdx));
      start = breakIdx;
    }
    manualPages.push(enabledSectionsWithEntries.slice(start));
  }

  // Auto-pagination: measure content and split into A4 pages.
  // Measures at FLOW-ITEM level (headings + entries), not whole sections —
  // long sections flow across pages instead of overflowing into the void.
  // Mirrors the PDF export's flowLayout: heading never orphaned, two-column
  // blocks move as one unit, bottom limit = PAGE_HEIGHT - 2*margin.
  const useAutoPaginate = pageBreaks.length === 0;

  interface FlowItem {
    kind: "heading" | "entry";
    section: SectionWithEntries;
    entry?: SectionWithEntries["entries"][0];
    /** true = a two-column block (may span multiple flow items when split) */
    block?: boolean;
    /** For split two-column blocks: [start, end) row range within the section */
    blockRange?: { start: number; end: number };
  }

  // Build the flow item list (same shape as the PDF exporter's flowLayout).
  // Two-column sections taller than one page are pre-split into chunks so a
  // long section (e.g. 27 orchestra jobs) flows across pages without a void.
  const isTwoColumnRef = useRef(isTwoColumn);
  isTwoColumnRef.current = isTwoColumn;
  const flowItems: FlowItem[] = useMemo(() => {
    const items: FlowItem[] = [];
    for (const section of enabledSectionsWithEntries) {
      items.push({ kind: "heading", section });
      const twoCol = isTwoColumnRef.current(section);
      if (twoCol && section.entries.length > 1) {
        // Estimate whether the block fits a single page: measured properly
        // after render; the pre-split is a safety bound (max rows per page).
        const half = Math.ceil(section.entries.length / 2);
        // Rough per-row height: entry rows are ~50-90px; use a generous
        // 120px/row cap so a chunk never overflows one page.
        const maxRowsPerPage = Math.max(
          4,
          Math.floor((PAGE_HEIGHT - pageMargin * 2 - 120) / 120)
        );
        const rows = half;
        if (rows > maxRowsPerPage) {
          for (let start = 0; start < rows; start += maxRowsPerPage) {
            const end = Math.min(start + maxRowsPerPage, rows);
            items.push({
              kind: "entry",
              section,
              block: true,
              blockRange: { start, end },
            });
          }
        } else {
          items.push({ kind: "entry", section, block: true });
        }
      } else {
        for (const entry of section.entries) {
          items.push({ kind: "entry", section, entry });
        }
      }
    }
    return items;
  }, [enabledSectionsWithEntries, pageMargin]);

  useEffect(() => {
    if (!useAutoPaginate || !measureRef.current) {
      setAutoPages([]);
      return;
    }

    const measureEl = measureRef.current;
    const innerContent = measureEl.firstElementChild as HTMLElement;
    if (!innerContent) return;

    const availableHeight = PAGE_HEIGHT - pageMargin * 2;

    const contentHeight = innerContent.scrollHeight;
    if (contentHeight <= availableHeight) {
      // Fits on one page
      setAutoPages([enabledSectionsWithEntries]);
      return;
    }

    // Measure each flow element from the rendered measurement DOM.
    // The measurement DOM renders flat flow items in order:
    // [profile header?] then for each section: heading wrapper, entry wrappers.
    const els = Array.from(innerContent.children) as HTMLElement[];
    let idx = 0;
    let profileHeaderHeight = 0;
    if (els.length > 0 && els[0].dataset.flow === "profile") {
      profileHeaderHeight = els[0].offsetHeight + spacing.section;
      idx = 1;
    }

    // Distribute flow items across pages with orphan protection
    const pages: SectionWithEntries[][] = [];
    let pageItems: FlowItem[] = [];
    let currentHeight = profileHeaderHeight;

    const flush = () => {
      if (pageItems.length === 0) return;
      const pageSections: SectionWithEntries[] = [];
      const seen = new Map<
        string,
        { group: SectionWithEntries; hasHeading: boolean }
      >();
      for (const it of pageItems) {
        const s = it.section;
        let rec = seen.get(s.id);
        if (!rec) {
          const group: SectionWithEntries = { ...s, entries: [] };
          rec = { group, hasHeading: false };
          seen.set(s.id, rec);
          pageSections.push(group);
        }
        if (it.kind === "heading") {
          rec.hasHeading = true;
        }
        if (it.entry) {
          rec.group.entries.push(it.entry);
        } else if (it.block && it.blockRange) {
          // Split two-column block chunk: push [col1 range, col2 range]
          const half = Math.ceil(s.entries.length / 2);
          const col1 = s.entries.slice(0, half);
          const col2 = s.entries.slice(half);
          const c1s = col1.slice(it.blockRange.start, it.blockRange.end);
          const c2s = col2.slice(it.blockRange.start, it.blockRange.end);
          rec.group.entries.push(...c1s, ...c2s);
          (rec.group as SectionWithEntries & { twoColCounts?: { c1: number; c2: number } }).twoColCounts = {
            c1: c1s.length,
            c2: c2s.length,
          };
        } else if (it.block) {
          // Whole two-column block: all entries of the section move together
          rec.group.entries.push(...s.entries);
        }
      }
      // Mark continuation groups (no heading on this page)
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

    for (let i = 0; i < flowItems.length; i++) {
      const item = flowItems[i];
      const el = els[idx];
      idx += 1;
      const height = (el ? el.offsetHeight : 0) + (item.kind === "heading" ? spacing.section : spacing.item);

      if (item.kind === "heading") {
        // Orphan protection: heading must fit with its first content item
        const next = flowItems[i + 1];
        const withNext =
          next && next.kind === "entry" && next.section.id === item.section.id
            ? height + (els[idx]?.offsetHeight ?? 0) + spacing.item
            : height;
        if (currentHeight + withNext > availableHeight && pageItems.length > 0) {
          flush();
          currentHeight = 0;
        }
        pageItems.push(item);
        currentHeight += height;
        continue;
      }

      // Entry (single-col) or whole two-column block
      if (currentHeight + height > availableHeight && pageItems.length > 0) {
        flush();
        currentHeight = 0;
      }
      pageItems.push(item);
      currentHeight += height;
    }
    flush();

    setAutoPages(pages.length > 0 ? pages : [enabledSectionsWithEntries]);
  }, [useAutoPaginate, flowItems, pageMargin, spacing.section, spacing.item, fontStack, activeLang, enabledSectionsWithEntries]);

  // Use auto pages if available, otherwise manual
  const pages = useAutoPaginate && autoPages.length > 0 ? autoPages : manualPages;

  // Responsive scaling: scale the A4 page to fit the container width on mobile
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);
  useEffect(() => {
    const updateScale = () => {
      if (typeof window === "undefined") return;
      const container = measureRef.current?.parentElement?.parentElement;
      if (!container) return;
      const containerWidth = container.clientWidth;
      const padding = containerWidth < 640 ? 32 : 48;
      const available = containerWidth - padding;
      const newScale = available < PAGE_WIDTH ? available / PAGE_WIDTH : 1;
      if (Math.abs(newScale - scaleRef.current) > 0.01) {
        scaleRef.current = newScale;
        setScale(newScale);
      }
    };
    updateScale();
    window.addEventListener("resize", updateScale);
    const timer = setTimeout(updateScale, 100);
    // Also observe container size changes (e.g. sidebar toggle, view mode switch)
    const container = measureRef.current?.parentElement?.parentElement;
    let observer: ResizeObserver | undefined;
    if (container && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(updateScale);
      observer.observe(container);
    }
    return () => {
      window.removeEventListener("resize", updateScale);
      clearTimeout(timer);
      observer?.disconnect();
    };
  }, [useAutoPaginate]);

  return (
    <>
      {/* Hidden measurement container for auto-pagination.
          Renders FLAT flow items in order — each flow item is a direct child
          element tagged with data-flow — so the pagination effect can measure
          every heading/entry independently (not whole sections). */}
      {useAutoPaginate && (
        <div
          ref={measureRef}
          style={{
            position: "absolute",
            left: "-9999px",
            top: "0",
            width: `${PAGE_WIDTH - pageMargin * 2}px`,
            visibility: "hidden",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              fontFamily: fontStack,
              color: textColor,
              fontSize: "14px",
            }}
          >
            <div data-flow="profile">{renderProfileHeader()}</div>
            {flowItems.map((it, i) =>
              it.kind === "heading" ? (
                <div key={"m-h-" + it.section.id} data-flow="heading">
                  {renderHeading(sanitizeText(it.section.title))}
                </div>
              ) : it.block ? (
                <div key={"m-b-" + it.section.id} data-flow="block">
                  <div style={{ display: "flex", gap: `${spacing.item * 4}px` }}>
                    <div style={{ flex: 1 }}>
                      {it.section.entries.slice(0, it.blockRange?.end ?? Math.ceil(it.section.entries.length / 2)).map(renderEntry)}
                    </div>
                    <div style={{ flex: 1 }}>
                      {it.section.entries.slice(it.blockRange?.end ?? Math.ceil(it.section.entries.length / 2)).map(renderEntry)}
                    </div>
                  </div>
                </div>
              ) : (
                <div key={"m-e-" + it.entry!.id} data-flow="entry">
                  {renderEntry(it.entry!)}
                </div>
              )
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col items-center gap-4 w-full">
        {pages.map((pageSections, pageIdx) => (
          <div
            key={pageIdx}
            style={{
              width: `${PAGE_WIDTH * scale}px`,
              height: useAutoPaginate ? `${PAGE_HEIGHT * scale}px` : undefined,
            }}
          >
            <div
              className="bg-white shadow-lg relative flex-shrink-0"
              style={{
                width: `${PAGE_WIDTH}px`,
                minHeight: `${PAGE_HEIGHT}px`,
                maxHeight: useAutoPaginate ? `${PAGE_HEIGHT}px` : undefined,
                overflow: useAutoPaginate ? "hidden" : "visible",
                padding: `${pageMargin}px`,
                fontFamily: fontStack,
                color: textColor,
                backgroundColor: pageMarginColor,
                borderRadius: `${Math.min(borderRadius, 4)}px`,
                fontSize: "14px",
                transformOrigin: "top left",
                transform: `scale(${scale})`,
              }}
            >
              {/* Profile header — only on first page */}
              {pageIdx === 0 && renderProfileHeader()}

              {pageSections.map(renderSection)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}