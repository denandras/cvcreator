"use client";

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

  // Filter enabled sections and entries
  const enabledSections = sections.filter((s) => s.is_enabled);
  const enabledSectionsWithEntries = enabledSections.map((s) => ({
    ...s,
    entries: s.entries.filter((e) => e.is_enabled),
  }));

  // Determine which sections are two-column based on template defaults or per-section config
  const isTwoColumn = (section: SectionWithEntries) => {
    const layout = section.layout_config as Record<string, unknown>;
    if (layout?.columns === "two") return true;
    if (layout?.columns === "one") return false;
    return template.twoColumnDefault;
  };

  // Build page content — split by page breaks
  const pages: SectionWithEntries[][] = [];
  if (pageBreaks.length === 0) {
    pages.push(enabledSectionsWithEntries);
  } else {
    let start = 0;
    for (const breakIdx of pageBreaks) {
      pages.push(enabledSectionsWithEntries.slice(start, breakIdx));
      start = breakIdx;
    }
    pages.push(enabledSectionsWithEntries.slice(start));
  }

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

  const renderEntry = (entry: SectionWithEntries["entries"][0]) => {
    const translation = entry.translations.find((t) => t.language === activeLang);
    const title = translation?.title ?? "";
    const organization = translation?.organization ?? "";
    const description = translation?.description ?? "";
    const year = entry.year;

    return (
      <div
        key={entry.id}
        style={{ marginBottom: `${spacing.item}px`, lineHeight: spacing.lineHeight }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-semibold" style={{ color: primary, fontSize: "0.95rem" }}>
            {title}
          </span>
          {year && (
            <span className="text-xs font-medium whitespace-nowrap" style={{ color: palette.muted }}>
              {year}
            </span>
          )}
        </div>
        {organization && (
          <div className="text-sm" style={{ color: palette.muted }}>
            {organization}
          </div>
        )}
        {description && (
          <div className="text-sm mt-1" style={{ color: palette.text, whiteSpace: "pre-wrap" }}>
            {description}
          </div>
        )}
      </div>
    );
  };

  const renderSection = (section: SectionWithEntries) => {
    const twoCol = isTwoColumn(section);
    return (
      <div key={section.id} style={{ marginBottom: `${spacing.section}px` }}>
        {renderHeading(section.title)}
        {twoCol ? (
          <div className="grid grid-cols-2 gap-4">
            {section.entries.map(renderEntry)}
          </div>
        ) : (
          <div>{section.entries.map(renderEntry)}</div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {pages.map((pageSections, pageIdx) => (
        <div
          key={pageIdx}
          className="bg-white shadow-lg relative"
          style={{
            width: `${PAGE_WIDTH}px`,
            minHeight: `${PAGE_HEIGHT}px`,
            padding: `${pageMargin}px`,
            fontFamily: fontStack,
            color: palette.text,
            backgroundColor: palette.bg,
            borderRadius: `${Math.min(borderRadius, 4)}px`,
            fontSize: "14px",
          }}
        >
          {/* Profile header — only on first page */}
          {pageIdx === 0 && (profileName || profileTitle || profilePicture) && (
            <div style={{ marginBottom: `${spacing.section}px` }} className="flex items-center gap-4">
              {profilePicture && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profilePicture}
                  alt="Profile"
                  crossOrigin="anonymous"
                  style={{
                    width: "96px",
                    height: "96px",
                    objectFit: "cover",
                    borderRadius: `${Math.min(borderRadius, 12)}px`,
                    flexShrink: 0,
                    border: `2px solid ${accent}`,
                  }}
                />
              )}
              <div style={{ textAlign: profilePicture ? "left" : "center", flex: 1 }}>
                {profileName && (
                  <h1
                    className="font-bold"
                    style={{
                      fontSize: "1.75rem",
                      color: primary,
                      marginBottom: "4px",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {profileName}
                  </h1>
                )}
                {profileTitle && (
                  <div
                    className="uppercase tracking-wider"
                    style={{
                      fontSize: "0.875rem",
                      color: accent,
                      fontWeight: 500,
                      letterSpacing: "0.1em",
                    }}
                  >
                    {profileTitle}
                  </div>
                )}
              </div>
              {!profilePicture && (
                <div
                  style={{
                    marginTop: "12px",
                    borderBottom: `1px solid ${palette.surface}`,
                  }}
                />
              )}
            </div>
          )}
          {pageIdx === 0 && profilePicture && (profileName || profileTitle) && (
            <div
              style={{
                marginBottom: `${spacing.section}px`,
                borderBottom: `1px solid ${palette.surface}`,
              }}
            />
          )}

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
      ))}
    </div>
  );
}