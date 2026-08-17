"use client";

import { useState, useEffect, useRef } from "react";
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
  // Margin color as design element — defaults to palette bg
  const pageMarginColor = (design.custom_config?.marginColor as string) ?? palette.bg;

  // Auto-pagination state
  const [autoPages, setAutoPages] = useState<SectionWithEntries[][]>([]);
  const measureRef = useRef<HTMLDivElement>(null);

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
    switch (headingStyle) {
      case "underline":
        return (
          <h2
            className="uppercase tracking-wide font-bold mb-3"
            style={{
              fontSize: "0.875rem",
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
              fontSize: "0.875rem",
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
              fontSize: "0.875rem",
              color: "#fff",
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
              fontSize: "0.8rem",
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
            <span className="text-xs font-medium whitespace-nowrap" style={{ color: palette.muted }}>
              {year}
            </span>
          )}
        </div>
        {organization && (
          <div className="text-sm italic" style={{ color: palette.muted }}>
            {organization}
          </div>
        )}
        {description && (
          <div className="text-sm italic mt-1" style={{ color: palette.text, whiteSpace: "pre-line" }}>
            {description}
          </div>
        )}
      </div>
    );
  };

  const renderSection = (section: SectionWithEntries) => {
    const twoCol = isTwoColumn(section);
    return (
      <div key={section.id} style={{ marginBottom: `${spacing.section}px`, breakInside: "avoid" }}>
        {renderHeading(sanitizeText(section.title))}
        {twoCol ? (
          (() => {
            const mid = Math.ceil(section.entries.length / 2);
            const col1 = section.entries.slice(0, mid);
            const col2 = section.entries.slice(mid);
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
                  color: accent,
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
                borderBottom: `1px solid ${palette.surface}`,
              }}
            />
          )}
        </div>
        {profilePicture && (safeName || safeTitle) && (
          <div
            style={{
              marginBottom: `${spacing.section}px`,
              borderBottom: `1px solid ${palette.surface}`,
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

  // Auto-pagination: measure content and split into A4 pages
  // We render a hidden measurement container, then distribute sections
  // across pages based on measured heights.
  const useAutoPaginate = pageBreaks.length === 0;

  useEffect(() => {
    if (!useAutoPaginate || !measureRef.current) {
      setAutoPages([]);
      return;
    }

    const measureEl = measureRef.current;
    const innerContent = measureEl.firstElementChild as HTMLElement;
    if (!innerContent) return;

    const contentHeight = innerContent.scrollHeight;
    const availableHeight = PAGE_HEIGHT - pageMargin * 2;

    if (contentHeight <= availableHeight) {
      // Fits on one page
      setAutoPages([enabledSectionsWithEntries]);
      return;
    }

    // Measure each section's height
    const sectionEls = Array.from(innerContent.children) as HTMLElement[];
    // First child is the profile header — account for it on page 1
    let profileHeaderHeight = 0;
    let firstSectionIdx = 0;
    if (sectionEls.length > 0 && !sectionEls[0].dataset.sectionId) {
      profileHeaderHeight = sectionEls[0].offsetHeight + spacing.section;
      firstSectionIdx = 1;
    }

    const sectionHeights: number[] = [];
    for (let i = firstSectionIdx; i < sectionEls.length; i++) {
      sectionHeights.push(sectionEls[i].offsetHeight + spacing.section);
    }

    // Distribute sections across pages
    const pages: SectionWithEntries[][] = [];
    let currentPage: SectionWithEntries[] = [];
    let currentHeight = profileHeaderHeight;

    for (let i = 0; i < sectionHeights.length; i++) {
      const sectionHeight = sectionHeights[i];
      if (currentHeight + sectionHeight > availableHeight && currentPage.length > 0) {
        // Start a new page
        pages.push(currentPage);
        currentPage = [enabledSectionsWithEntries[i]];
        currentHeight = sectionHeight;
      } else {
        currentPage.push(enabledSectionsWithEntries[i]);
        currentHeight += sectionHeight;
      }
    }
    if (currentPage.length > 0) pages.push(currentPage);

    setAutoPages(pages);
  }, [useAutoPaginate, enabledSectionsWithEntries, pageMargin, spacing.section, fontStack, activeLang]);

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
      {/* Hidden measurement container for auto-pagination */}
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
              color: palette.text,
              fontSize: "14px",
            }}
          >
            {renderProfileHeader()}
            {enabledSectionsWithEntries.map(renderSection)}
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
                color: palette.text,
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

              {showPageBreaks && pageIdx < pages.length - 1 && (
                <div
                  className="absolute left-0 right-0 border-t-2 border-dashed border-red-300"
                  style={{ bottom: "0" }}
                >
                  <span className="absolute -top-5 right-2 text-xs text-red-400">Page break</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}