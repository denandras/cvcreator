"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import type { SectionWithEntries, CVDesign } from "@/types/database";
import {
  getFontStack,
  getTemplate,
  getPalette,
  SPACING_VALUES,
  getLineHeightValue,
  PAGE_WIDTH,
  PAGE_HEIGHT,
} from "@/lib/design-constants";

interface CVPreviewProps {
  sections: SectionWithEntries[];
  design: Partial<CVDesign>;
  activeLang: string;
  profileName?: string;
  profileTitle?: string;
  profilePicture?: string | null;
}

export function CVPreview({
  sections,
  design,
  activeLang,
  profileName = "",
  profileTitle = "",
  profilePicture = null,
}: CVPreviewProps) {
  const template = getTemplate(design.template ?? "clean");
  const palette = getPalette(
    (design.custom_config?.paletteId as string) ?? template.defaultPalette
  );
  const fontStack = getFontStack(design.font_family ?? template.defaultFont);
  const spacing = SPACING_VALUES[design.spacing ?? "normal"];
  // Body line height: user preset (custom_config.lineHeight) overrides the
  // spacing preset's default.
  const lineHeight = getLineHeightValue(design, design.spacing ?? "normal");
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

  // Heading renderer — global override (custom_config.headingStyle, "auto" =
  // template default) takes precedence over the template's own style.
  const headingStyle =
    ((design.custom_config?.headingStyle as string) ?? "auto") === "auto"
      ? template.headingStyle
      : ((design.custom_config?.headingStyle as string) as
          | "underline" | "border" | "filled" | "minimal");

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
        style={{ marginBottom: `${spacing.item}px`, lineHeight, breakInside: "avoid" }}
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
    const meta = section as SectionWithEntries & {
      twocolChunks?: Array<{
        left: SectionWithEntries["entries"][0][];
        right: SectionWithEntries["entries"][0][];
      }>;
    };
    return (
      <div
        key={section.id}
        style={{
          marginBottom: isContinuation ? `${spacing.item}px` : `${spacing.section}px`,
          breakInside: "avoid",
        }}
      >
        {!isContinuation && renderHeading(sanitizeText(section.title))}
        {twoCol ? (
          (() => {
            const chunks = meta.twocolChunks;
            if (chunks && chunks.length > 0) {
              // Split-section chunks: exact per-column lists recorded by the
              // pagination flush — each column is an INDEPENDENT STACK (not
              // a strict row-aligned grid; sides end at different heights),
              // matching what the PDF renders on the same page.
              return (
                <div>
                  {chunks.map((chunk, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: `${spacing.item * 4}px` }}>
                      <div style={{ flex: 1 }}>{chunk.left.map(renderEntry)}</div>
                      <div style={{ flex: 1 }}>{chunk.right.map(renderEntry)}</div>
                    </div>
                  ))}
                </div>
              );
            }
            const mid = Math.ceil(section.entries.length / 2);
            const col1 = section.entries.slice(0, mid);
            const col2 = section.entries.slice(mid);
            return (
              <div style={{ display: "flex", alignItems: "flex-start", gap: `${spacing.item * 4}px` }}>
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

  // Pages come from auto-pagination (pure flow + user page-break-before flags).
  const useAutoPaginate = true;

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

  // Build the flow item list (same shape as the PDF exporter's flowLayout).
  // Two-column sections emit ONE chunk flow item — columns are independent
  // stacks that paginate with their own split points (no strict row grid).
  const isTwoColumnRef = useRef(isTwoColumn);
  isTwoColumnRef.current = isTwoColumn;
  const flowItems: FlowItem[] = useMemo(() => {
    const items: FlowItem[] = [];
    for (const section of enabledSectionsWithEntries) {
      items.push({ kind: "heading", section });
      const twoCol = isTwoColumnRef.current(section);
      if (twoCol && section.entries.length > 1) {
        const mid = Math.ceil(section.entries.length / 2);
        items.push({
          kind: "twocol",
          section,
          chunk: {
            left: section.entries.slice(0, mid),
            right: section.entries.slice(mid),
          },
        });
      } else {
        for (const entry of section.entries) {
          items.push({ kind: "entry", section, entry });
        }
      }
    }
    return items;
  }, [enabledSectionsWithEntries]);

  useEffect(() => {
    if (!useAutoPaginate || !measureRef.current) {
      setAutoPages([]);
      return;
    }

    const measureEl = measureRef.current;
    const innerContent = measureEl.firstElementChild as HTMLElement;
    if (!innerContent) return;

    // Mirror the PDF's bottom bound exactly: ink may reach pageH - one margin
    // (exporter: pageHeightPt - pageMargin). Using two margins here would make
    // the preview break pages before the PDF does.
    const availableHeight = PAGE_HEIGHT - pageMargin;

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

    // Per-entry measurement lookup for twocol chunk splits: collect every
    // data-flow="entry" child (tagged data-entry-id) from chunk measure
    // wrappers in flow order. Heights mirror renderEntry's box + item gap.
    const entryEls = new Map<string, HTMLElement>();
    for (const el of els) {
      if (el.dataset.flow !== "block") continue;
      for (const child of Array.from(el.querySelectorAll('[data-flow="entry"][data-entry-id]')) as HTMLElement[]) {
        const id = child.dataset.entryId;
        if (id && !entryEls.has(id)) entryEls.set(id, child);
      }
    }

    // Distribute flow items across pages (rules R1-R3)
    const pages: SectionWithEntries[][] = [];
    let pageItems: { item: FlowItem; height: number }[] = [];
    let currentHeight = profileHeaderHeight;

    const flush = (extraItems?: { item: FlowItem; height: number }[]) => {
      if (pageItems.length === 0 && !(extraItems && extraItems.length > 0)) return;
      const pageSections: SectionWithEntries[] = [];
      const seen = new Map<
        string,
        { group: SectionWithEntries; hasHeading: boolean }
      >();
      const allItems = extraItems ? [...pageItems, ...extraItems] : pageItems;
      for (const { item: it } of allItems) {
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
        } else if ((it.kind === "twocol" || it.kind === "twocolChunk") && it.chunk) {
          // Two-column chunk: ship the exact per-column lists on the group —
          // the renderer stacks each column independently, non row-aligned.
          const g = rec.group as SectionWithEntries & {
            twocolChunks?: Array<{
              left: SectionWithEntries["entries"][0][];
              right: SectionWithEntries["entries"][0][];
            }>;
          };
          if (!g.twocolChunks) g.twocolChunks = [];
          g.twocolChunks.push({ left: it.chunk.left, right: it.chunk.right });
          rec.group.entries.push(...it.chunk.left, ...it.chunk.right);
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
      // Heading items get spacing.section; every other flow item (entries,
      // twocol chunks) gets the terminal spacing.item gap, mirroring the
      // exporter's measured heights.
      const rawHeight = el ? el.offsetHeight : 0;
      const height = rawHeight + (item.kind === "heading" ? spacing.section : spacing.item);

      // User-controlled break: section explicitly set to start on a fresh page.
      if (
        item.kind === "heading" &&
        pageItems.length > 0 &&
        (item.section.layout_config as Record<string, unknown> | null)?.page_break_before === true
      ) {
        flush();
        currentHeight = 0;
      }

      // Pure flow: fills the current page; break only when the item doesn't fit.
      // Mirror the PDF's trailing-gap waiver: the previous item's terminal
      // spacing.item padding is invisible when it ends the page, so shrink it
      // before retrying the fit (keeps knife-edge rows on the same page).
      if (currentHeight + height > availableHeight && pageItems.length > 0) {
        const prevPadding = item.kind === "heading" ? 0 : spacing.item;
        let handled = false;
        if (currentHeight - prevPadding + height <= availableHeight) {
          currentHeight -= prevPadding;
          const prevPlaced = pageItems[pageItems.length - 1];
          if (prevPlaced) prevPlaced.height -= prevPadding;
          handled = true;
        } else if (
          (item.kind === "twocol" || item.kind === "twocolChunk") &&
          item.chunk
        ) {
          // Columns are independent stacks: fill per-column prefixes up to
          // the free height and let the (different-length) remainders start
          // the next page — same rule the PDF exporter applies. Free space
          // uses the FULL currentHeight (the previous entry's trailing gap
          // is real render space the chunk starts below — parity with the
          // exporter's `free = bottomLimit - currentY`).
          const free = availableHeight - currentHeight;
          const measureChild = (e: SectionWithEntries["entries"][0]) => {
            const el2 = entryEls.get(e.id);
            return el2 ? el2.offsetHeight + spacing.item : 0;
          };
          let hL = 0;
          let hR = 0;
          const placedL: SectionWithEntries["entries"] = [];
          const placedR: SectionWithEntries["entries"] = [];
          const restL: SectionWithEntries["entries"] = [];
          const restR: SectionWithEntries["entries"] = [];
          for (const e of item.chunk.left) {
            const h = measureChild(e);
            if (hL + h <= free) {
              placedL.push(e);
              hL += h;
            } else {
              restL.push(e);
            }
          }
          for (const e of item.chunk.right) {
            const h = measureChild(e);
            if (hR + h <= free) {
              placedR.push(e);
              hR += h;
            } else {
              restR.push(e);
            }
          }
          if (placedL.length + placedR.length > 0 && restL.length + restR.length > 0) {
            // Page N: existing items + fitted prefixes.
            flush([
              {
                item: {
                  kind: "twocolChunk",
                  section: item.section,
                  chunk: { left: placedL, right: placedR },
                },
                height: Math.max(hL, hR, 0),
              },
            ]);
            // Next page: the independent remainders as a continuation chunk.
            // Per-entry heights already measured — no re-measure pass needed.
            // Continuation chunks render entries WITHOUT a trailing gap on
            // the last item only when they end the page; the exporter's
            // remainder height keeps every entry's trailing gap (matches
            // measureEntry), so mirror that here.
            item.kind = "twocolChunk";
            item.chunk = { left: restL, right: restR };
            const restSum = (list: SectionWithEntries["entries"]) =>
              list.reduce((a, e) => a + measureChild(e), 0);
            const restH = Math.max(restSum(restL), restSum(restR), 0);
            currentHeight = restH + spacing.item;
            pageItems.push({ item, height: restH + spacing.item });
            handled = true;
          }
        }
        if (!handled) {
          flush();
          currentHeight = 0;
        }
      }
      pageItems.push({ item, height });
      currentHeight += height;
    }
    flush();

    setAutoPages(pages.length > 0 ? pages : [enabledSectionsWithEntries]);
  }, [useAutoPaginate, flowItems, pageMargin, spacing.section, spacing.item, lineHeight, fontStack, activeLang, enabledSectionsWithEntries]);

  // Pages come from the auto-pagination flow measurement above.
  const pages = autoPages.length > 0 ? autoPages : [enabledSectionsWithEntries];

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
              ) : it.chunk ? (
                // Twocol chunk: one measure wrapper per entry (data-flow=entry,
                // tagged data-entry-id) so the pagination effect can measure
                // per-entry heights for the independent-column split — the
                // wrapper layout mirrors the real two-column flex exactly.
                <div key={"m-c-" + it.section.id + "-" + i} data-flow="block">
                  <div style={{ display: "flex", alignItems: "flex-start", gap: `${spacing.item * 4}px` }}>
                    <div style={{ flex: 1 }}>
                      {it.chunk.left.map((e) => (
                        <div key={"mc-" + e.id} data-flow="entry" data-entry-id={e.id}>
                          {renderEntry(e)}
                        </div>
                      ))}
                    </div>
                    <div style={{ flex: 1 }}>
                      {it.chunk.right.map((e) => (
                        <div key={"mc-" + e.id} data-flow="entry" data-entry-id={e.id}>
                          {renderEntry(e)}
                        </div>
                      ))}
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