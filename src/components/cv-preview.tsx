"use client";

import { useState, useEffect, useRef } from "react";
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
import {
  computeFlowBlocks,
  paginate,
  groupPlacements,
  contentBoxHeightPx,
  isTwoColumnSection,
  flowColGapPx,
  sanitizeFlowText as sanitizeText,
  contactLines,
  CONTACT_LINE_PX,
  type FlowMeasure,
  type FlowBlock,
} from "@/lib/cv-flow-layout";

interface CVPreviewProps {
  sections: SectionWithEntries[];
  design: Partial<CVDesign>;
  activeLang: string;
  profileName?: string;
  profileTitle?: string;
  profilePicture?: string | null;
}

/** Indent of continuation rows (organization / description) under an entry's
 * title — makes a wrapped 2nd visual row read as part of the same entry. */
const CONT_INDENT_PX = 10;

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
  // Description placement: "below" (default) or "inline" after the title with
  // a separator ("—" dash, ":", "·", "•", "|")
  const descriptionPlacement = (design.custom_config?.descriptionPlacement as string) ?? "below";
  const inlineDesc = descriptionPlacement === "inline";
  const descSeparator = ((design.custom_config?.descriptionSeparator as string) ?? "—") || "—";
  // Per-role color overrides — custom values win over the palette
  const pageMarginColor = (design.custom_config?.marginColor as string) ?? palette.bg;
  // Content-area background behind the text (distinct from the margin ring)
  const contentBgColor = (design.custom_config?.contentBgColor as string) ?? "#ffffff";
  const textColor = (design.custom_config?.textColor as string) ?? palette.text;
  const mutedColor = (design.custom_config?.mutedColor as string) ?? palette.muted;
  const subtitleColor =
    (design.custom_config?.subtitleColor as string) ??
    design.accent_color ??
    palette.accent;
  const surfaceColor = (design.custom_config?.surfaceColor as string) ?? palette.surface;

  // Re-run pagination once web fonts finish loading. A page measured with
  // fallback-font metrics reflows TALLER when the real font swaps in, which
  // used to clip the last rendered row on a full page. Bumping this state
  // re-runs the pagination effect (and re-keys the measurement container).
  const [fontsLoadedTick, setFontsLoadedTick] = useState(0);
  useEffect(() => {
    if (typeof document === "undefined" || !("fonts" in document)) return;
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) setFontsLoadedTick((t) => t + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  // Heading renderer — global override (custom_config.headingStyle, "auto" =
  // template default) takes precedence over the template's own style.
  const headingStyle =
    ((design.custom_config?.headingStyle as string) ?? "auto") === "auto"
      ? template.headingStyle
      : ((design.custom_config?.headingStyle as string) as
          | "underline" | "border" | "filled" | "minimal");

  /** Heading auto-shrink: measure the uppercased title with the real
   *  webfont (canvas) and shrink only when it would overflow the content
   *  box minus the style's horizontal chrome. The shared flow module calls
   *  this through its injected measure, so ONE shrink decision feeds both
   *  the drawn heading and the paginated box. */
  const fitHeadingPx = (title: string, basePx: number, padPx: number): number => {
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

  const renderHeading = (title: string) => {
    switch (headingStyle) {
      case "underline":
        return (
          <h2
            data-flow="heading"
            className="uppercase tracking-wide font-bold mb-3"
            style={{
              fontSize: `${fitHeadingPx(title, 18, 0)}px`,
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
            data-flow="heading"
            className="uppercase tracking-wider font-bold mb-3"
            style={{
              fontSize: `${fitHeadingPx(title, 18, 13)}px`,
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
            data-flow="heading"
            className="uppercase tracking-wider font-bold mb-3 px-3 py-1.5"
            style={{
              fontSize: `${fitHeadingPx(title, 18, 12)}px`,
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
            data-flow="heading"
            className="uppercase tracking-widest font-semibold mb-2"
            style={{
              fontSize: `${fitHeadingPx(title, 16, 0)}px`,
              color: primary,
              letterSpacing: "0.15em",
            }}
          >
            {title}
          </h2>
        );
      default:
        return <h2 data-flow="heading" className="font-bold">{title}</h2>;
    }
  };

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
    // Free-text year (e.g. "2017-2021") wins over the int year column
    const yearText = sanitizeText(
      ((entry.data as { year_text?: string } | undefined)?.year_text ?? "") ||
      (entry.year != null && entry.year !== 0 ? String(entry.year) : "")
    );
    // Continuation rows (everything after the title line) are indented so a
    // wrapped/second visual row can't be read as a new list item.
    const contIndent = `${CONT_INDENT_PX}px`;

    return (
      <div
        key={entry.id}
        data-flow="entry"
        data-entry-id={entry.id}
        style={{ marginBottom: `${spacing.item}px`, lineHeight, breakInside: "avoid" }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-semibold" style={{ color: primary, fontSize: "0.95rem" }}>
            {title}
            {/* Inline placement: the description starts right after the title,
                separated by the configured separator — same visual line. */}
            {inlineDesc && description && (
              <span className="text-sm italic font-normal" style={{ color: textColor }}>
                <span style={{ color: mutedColor }}>{" "}{descSeparator}{" "}</span>
                {description}
              </span>
            )}
          </span>
          {yearText && (
            <span className="text-xs font-medium whitespace-nowrap" style={{ color: mutedColor }}>
              {yearText}
            </span>
          )}
        </div>
        {organization && (
          <div className="text-sm italic" style={{ color: mutedColor, paddingLeft: contIndent }}>
            {organization}
          </div>
        )}
        {description && !inlineDesc && (
          <div className="text-sm italic mt-1" style={{ color: textColor, paddingLeft: contIndent, whiteSpace: "pre-line" }}>
            {description}
          </div>
        )}
      </div>
    );
  };

  const renderSection = (section: SectionWithEntries) => {
    const twoCol = isTwoColumnSection(section, template);
    const isContinuation = (section as SectionWithEntries & { isContinuation?: boolean }).isContinuation === true;
    const meta = section as SectionWithEntries & {
      twocolChunks?: Array<{
        left: SectionWithEntries["entries"][0][];
        right: SectionWithEntries["entries"][0][];
      }>;
    };
    // Active-language section title: translated title wins when non-empty,
    // otherwise the original section title (primary language).
    const titleMap = (section.layout_config as Record<string, unknown> | null)
      ?.sectionTitleTranslations as Record<string, string> | undefined;
    const sectionTitle =
      (titleMap && titleMap[activeLang]) || sanitizeText(section.title);
    return (
      <div
        key={section.id}
        data-flow="section"
        data-section={section.id}
        style={{
          marginBottom: isContinuation ? `${spacing.item}px` : `${spacing.section}px`,
          breakInside: "avoid",
        }}
      >
        {!isContinuation && renderHeading(sectionTitle)}
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
                    <div key={i} data-flow="block" style={{ display: "flex", alignItems: "flex-start", gap: `${flowColGapPx(design)}px` }}>
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
              <div data-flow="block" style={{ display: "flex", alignItems: "flex-start", gap: `${flowColGapPx(design)}px` }}>
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
        <div
          style={{ marginBottom: `${spacing.section}px` }}
          className={`flex gap-4 ${profilePicture ? "items-start" : "items-center"}`}
        >
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
          <div
            style={{
              textAlign: profilePicture ? "left" : "center",
              flex: 1,
              // With a photo the text block starts exactly at the photo's
              // top line — the name's own line-height gap is neutralized so
              // nothing adds space or an extra line before the name.
              ...(profilePicture ? { marginTop: "-4px" } : null),
            }}
          >
            {safeName && (
              <h1
                className="font-bold"
                style={{
                  fontSize: "1.75rem",
                  lineHeight: 1.2,
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
          {/* No divider here (Step 8): this used to be a zero-width flex
              child with a borderBottom — it never painted (the border sat on
              a 0px box), but as a SECOND flex item it consumed one `gap-4`
              (16px), shrinking the centered text block from 698px to 682px
              and shifting the centered name/subtitle 8px left of the content
              box's true center (REPORT.md §3 "secondary": preview-1-boxes
              name/title w = 682). The PDF exporter centers on the content
              box (card 3, Step 4 option (a): no divider), so the phantom
              child had to go for Δx parity on the two header rows. */}
        </div>
        {profilePicture && (safeName || safeTitle) ? (
          // Divider: only when there's no name (a 1.75rem name already
          // covers the divider's height slot — no extra line/space below
          // a photo'd name+title header).
          !safeName ? (
            <div
              style={{
                marginBottom: `${spacing.section}px`,
                borderBottom: `1px solid ${surfaceColor}`,
              }}
            />
          ) : null
        ) : null}
      </>
    );
  };

  // Pages come from auto-pagination (pure flow + user page-break-before flags).
  const useAutoPaginate = true;

  // ── Auto-pagination: ONE shared flow plan (src/lib/cv-flow-layout.ts) ─────
  // The measure container renders the SAME tree the page renders, so the
  // DOM IS this engine's text measurement: entry ink boxes are read off it
  // and injected into the shared module, which owns every gap, the heading
  // and header box constants, and the pagination rules — the exact same
  // model the PDF exporter renders through px2pt(). A dev-only assertion
  // proves the plan predicts the measured tree (≤ 0.5 px); silent drift
  // became a loud dev failure.
  useEffect(() => {
    if (!useAutoPaginate || !measureRef.current) {
      setAutoPages([]);
      return;
    }

    const measureEl = measureRef.current;
    const innerContent = measureEl.firstElementChild as HTMLElement;
    if (!innerContent) return;

    // Collect the flow elements from the measure tree: the injected
    // measure reads entry ink boxes from them, and the dev assertion reads
    // every block's real top/box.
    const kids = Array.from(innerContent.children) as HTMLElement[];
    const profileEl =
      kids.length > 0 && kids[0].dataset.flow === "profile" ? kids[0] : null;
    const sectionEls = profileEl ? kids.slice(1) : kids;

    const headingEls = new Map<string, HTMLElement>(); // section.id → h2
    const blockEls = new Map<string, HTMLElement>(); // section.id → twocol flex
    const entryEls = new Map<string, HTMLElement>(); // entry.id → entry root
    for (const secEl of sectionEls) {
      const secId = secEl.dataset.section;
      if (!secId) continue;
      const h = secEl.querySelector<HTMLElement>(':scope > [data-flow="heading"]');
      if (h) headingEls.set(secId, h);
      const b = secEl.querySelector<HTMLElement>('[data-flow="block"]');
      if (b) blockEls.set(secId, b);
      for (const t of Array.from(
        secEl.querySelectorAll<HTMLElement>('[data-flow="entry"][data-entry-id]')
      )) {
        const id = t.dataset.entryId;
        if (!id) continue;
        entryEls.set(id, t);
      }
    }

    // The measure tree must correspond to the CURRENT state before its
    // geometry is usable. During SSR hydration the DOM can still hold the
    // SERVER-rendered demo ids (demo-data's id counter differs per process)
    // while the React state has the client's — element COUNTS match but ids
    // do not, so boxes would read as zeros and the dev assertion would throw
    // mid-hydration. Verify id COVERAGE and skip; the post-hydration
    // re-render re-runs this effect against the real tree.
    const hasHeader = Boolean(
      sanitizeText(profileName) ||
        sanitizeText(profileTitle) ||
        profilePicture
    );
    const measureTreeReady =
      hasHeader === (profileEl != null) &&
      enabledSectionsWithEntries.every(
        (s) =>
          headingEls.has(s.id) && s.entries.every((e) => entryEls.has(e.id))
      );
    if (!measureTreeReady) return;

    // The DOM is this engine's text measurement (subpixel ink boxes).
    const measure: FlowMeasure = {
      entryBoxPx: (entry) => {
        const el = entryEls.get(entry.id);
        return el ? el.getBoundingClientRect().height : 0;
      },
      headingFontSizePx: (title, basePx, padPx) =>
        fitHeadingPx(title, basePx, padPx),
    };

    const blocks = computeFlowBlocks(
      enabledSectionsWithEntries,
      design,
      activeLang,
      {
        profile: {
          name: profileName,
          title: profileTitle,
          hasPhoto: Boolean(profilePicture),
        },
        measure,
      }
    );
    const placed = paginate(blocks, contentBoxHeightPx(design));
    const pages = groupPlacements(placed, enabledSectionsWithEntries);

    // Dev-only DOM assertion (REPORT.md §4 Step 6): the shared model must
    // predict the very tree it renders, cumulatively — ≤ 0.5 px per block
    // top and box, and for the whole content height.
    if (process.env.NODE_ENV !== "production") {
      const originTop = innerContent.getBoundingClientRect().top;
      const elFor = (b: FlowBlock): HTMLElement | null => {
        if (b.kind === "header") return profileEl;
        if (!b.sectionId) return null;
        if (b.kind === "heading") return headingEls.get(b.sectionId) ?? null;
        if (b.kind === "twocolChunk") return blockEls.get(b.sectionId) ?? null;
        if (b.kind === "entry" && b.entry) {
          return entryEls.get(b.entry.id) ?? null;
        }
        return null;
      };
      const mism: string[] = [];
      let flowTop = 0;
      let maxAbs = 0;
      let domContent = 0;
      for (const b of blocks) {
        const el = elFor(b);
        if (el) {
          const r = el.getBoundingClientRect();
          const dTop = r.top - originTop - flowTop;
          const dBox = r.height - b.heightPx;
          maxAbs = Math.max(maxAbs, Math.abs(dTop), Math.abs(dBox));
          domContent = Math.max(domContent, r.bottom - originTop);
          if (Math.abs(dTop) > 0.5 || Math.abs(dBox) > 0.5) {
            mism.push(
              `${b.key}: Δtop=${dTop.toFixed(3)}px Δbox=${dBox.toFixed(3)}px`
            );
          }
        }
        flowTop += b.heightPx + b.gapAfterPx;
      }
      const dContent = flowTop - domContent;
      if (mism.length > 0 || Math.abs(dContent) > 0.5) {
        console.error("[cv-flow-layout] plan↔DOM mismatch", {
          blocks: blocks.length,
          planSum: flowTop,
          domContentHeight: domContent,
          maxAbs,
          mism,
        });
        throw new Error(
          `cv-flow-layout plan↔DOM mismatch (max |Δ| ${maxAbs.toFixed(3)}px): ` +
            (mism[0] ?? `content height Δ${dContent.toFixed(3)}px`)
        );
      }
    }

    setAutoPages(pages.length > 0 ? pages : [enabledSectionsWithEntries]);
  }, [
    useAutoPaginate,
    enabledSectionsWithEntries,
    design,
    activeLang,
    profileName,
    profileTitle,
    profilePicture,
    fontsLoadedTick,
  ]);

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
          Renders the SAME flow the visible page renders — renderProfileHeader()
          then renderSection() per enabled section, through the very renderers
          the page uses — so CSS margin collapsing at section boundaries (the
          section wrapper's marginBottom: spacing.section collapsing with the
          last entry's marginBottom: spacing.item) is part of the measurement
          by construction. The old flat re-derivation dropped that collapse
          (12px per boundary for "normal" spacing) and under-measured the
          content by 48px for the demo CV, hiding a whole page split. Flow
          elements are tagged data-flow (+ data-entry-id / data-section) so
          the shared cv-flow-layout module can read entry ink boxes off this
          tree (its injected measure) and the dev assertion can check the
          plan against every block's real top. */}
      {useAutoPaginate && (
        <div
          ref={measureRef}
          key={`measure-${fontsLoadedTick}`}
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
            {/* The measure header mirror: renderProfileHeader already carries
                its own spacing.section marginBottom — wrapping it in another
                container double-charged the trailing gap (measurement header >
                render header → every flow Y drifts, rows crammed/shifted on
                pages 2+). The wrapper must add ZERO extra space. */}
            <div data-flow="profile">{renderProfileHeader()}</div>
            {/* The same sections the page renders, via the same renderSection:
                heading + entries per section, wrapper marginBottom intact. */}
            {enabledSectionsWithEntries.map((section) => renderSection(section))}
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
              className="shadow-lg relative flex-shrink-0"
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
              {/* Content-area background (custom_config.contentBgColor); fills
                  the inner content box so the margin ring keeps its own color. */}
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: `${pageMargin}px`,
                  backgroundColor: contentBgColor,
                  borderRadius: `${Math.max(borderRadius - 2, 0)}px`,
                  zIndex: 0,
                }}
              />
              <div style={{ position: "relative", zIndex: 1 }}>
              {/* Profile header — only on first page */}
              {pageIdx === 0 && renderProfileHeader()}

              {pageSections.map(renderSection)}
              </div>

              {/* End-of-CV contact block (phone / e-mail): the BOTTOM
                  MARGIN BAND below the content box — outside the flow by
                  construction. Absolutely positioned inside the page div
                  (same padding-box origin the contentBg inset div above
                  uses), so it consumes no flow height, cannot shift a
                  row, cannot trigger a page break, and is not part of
                  the measurement tree the pagination walks. It sits
                  OUTSIDE the content wrapper on purpose: the parity
                  capture/gate walks the wrapper's text rows only, so
                  this block never enters the gate's row pairing.
                  contactLines() is [] with both checkboxes off (or both
                  values empty) — then nothing renders at all. Geometry:
                  12 px rows at single line-height (CONTACT_LINE_PX),
                  vertically centred in the pageMargin-tall band,
                  horizontally aligned like the profile header (centred
                  when the header centres = no photo, left otherwise). */}
              {pageIdx === pages.length - 1 &&
                (() => {
                  const contact = contactLines(design);
                  if (contact.length === 0) return null;
                  const bandTopPx = PAGE_HEIGHT - pageMargin;
                  const blockHPx = contact.length * CONTACT_LINE_PX;
                  const topPx =
                    bandTopPx + Math.max(0, (pageMargin - blockHPx) / 2);
                  return (
                    <div
                      data-flow="contact"
                      style={{
                        position: "absolute",
                        left: `${pageMargin}px`,
                        top: `${topPx}px`,
                        width: `${PAGE_WIDTH - pageMargin * 2}px`,
                        zIndex: 2,
                        color: mutedColor,
                        fontSize: `${CONTACT_LINE_PX}px`,
                        lineHeight: 1,
                        textAlign: profilePicture ? "left" : "center",
                      }}
                    >
                      {contact.map((l) => (
                        <div key={l.kind}>{l.text}</div>
                      ))}
                    </div>
                  );
                })()}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}