"use client";

import { useState } from "react";
import type { CVDesign, Spacing } from "@/types/database";
import {
  FONT_OPTIONS,
  COLOR_PALETTES,
  TEMPLATES,
  LINE_HEIGHT_PRESETS,
  getLineHeightValue,
  getPalette,
  getTemplate,
} from "@/lib/design-constants";

interface DesignSidebarProps {
  design: Partial<CVDesign>;
  dirty: boolean;
  saving: boolean;
  saved: boolean;
  onChange: (field: string, value: unknown) => void;
  onSave: () => void;
  onApplyTemplate: (templateId: string) => void;
  onApplyPalette: (paletteId: string) => void;
  onSidebarClose?: () => void;
}

export function DesignSidebar({
  design,
  dirty,
  saving,
  saved,
  onChange,
  onSave,
  onApplyTemplate,
  onApplyPalette,
  onSidebarClose,
}: DesignSidebarProps) {
  const [activeTab, setActiveTab] = useState<"template" | "typography" | "colors" | "layout">("template");
  const currentPalette = getPalette((design.custom_config?.paletteId as string) ?? "slate");

  const tabs = [
    { id: "template" as const, label: "Template", icon: "Layout" },
    { id: "typography" as const, label: "Fonts", icon: "Type" },
    { id: "colors" as const, label: "Colors", icon: "Palette" },
    { id: "layout" as const, label: "Layout", icon: "Settings" },
  ];

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200 shadow-xl lg:shadow-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
        <h2 className="text-sm font-semibold text-gray-900">Design</h2>
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              Unsaved
            </span>
          )}
          {saved && (
            <span className="text-xs text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">
              Saved
            </span>
          )}
          {onSidebarClose && (
            <button
              onClick={onSidebarClose}
              className="text-gray-400 hover:text-gray-700 p-1 rounded hover:bg-gray-100 transition-colors"
              title="Close sidebar"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-2 py-2.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? "text-teal-600 border-b-2 border-teal-600"
                : "text-gray-500 hover:text-gray-700 border-b-2 border-transparent"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Template tab */}
        {activeTab === "template" && (
          <div className="space-y-3">
            {TEMPLATES.map((tpl) => {
              const isActive = (design.template ?? "clean") === tpl.id;
              const tplPalette = getPalette(tpl.defaultPalette);
              return (
                <button
                  key={tpl.id}
                  onClick={() => onApplyTemplate(tpl.id)}
                  className={`w-full text-left rounded-lg border-2 p-3 transition-all ${
                    isActive
                      ? "border-teal-500 bg-teal-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-gray-900">{tpl.label}</span>
                    {isActive && (
                      <span className="text-xs text-teal-600 font-medium">Active</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mb-2">{tpl.description}</p>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded"
                      style={{ backgroundColor: tplPalette.accent }}
                    />
                    <div
                      className="w-6 h-6 rounded"
                      style={{ backgroundColor: tplPalette.primary }}
                    />
                    <span className="text-xs text-gray-400 capitalize">{tpl.defaultFont}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Typography tab */}
        {activeTab === "typography" && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Font Family
              </label>
              <div className="space-y-2">
                {FONT_OPTIONS.map((font) => {
                  const isActive = (design.font_family ?? "inter") === font.value;
                  return (
                    <button
                      key={font.value}
                      onClick={() => onChange("font_family", font.value)}
                      className={`w-full text-left rounded-lg border-2 px-3 py-2.5 transition-all ${
                        isActive
                          ? "border-teal-500 bg-teal-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">{font.label}</span>
                        {isActive && (
                          <span className="text-xs text-teal-600 font-medium">Active</span>
                        )}
                      </div>
                      <div
                        className="text-lg mt-1 text-gray-600"
                        style={{ fontFamily: font.stack }}
                      >
                        {font.preview}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Spacing
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["compact", "normal", "relaxed"] as Spacing[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => onChange("spacing", s)}
                    className={`rounded-lg border-2 px-2 py-2 text-xs font-medium capitalize transition-all ${
                      (design.spacing ?? "normal") === s
                        ? "border-teal-500 bg-teal-50 text-teal-700"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Line Height
              </label>
              <div className="grid grid-cols-4 gap-2">
                {LINE_HEIGHT_PRESETS.map((p) => {
                  const fallback = getLineHeightValue(design, (design.spacing as Spacing) ?? "normal");
                  const isActive = p.value === fallback && !LINE_HEIGHT_PRESETS.some(
                    (q) => q.id !== p.id && q.value === fallback
                  );
                  return (
                    <button
                      key={p.id}
                      onClick={() => onChange("custom_config", { ...(design.custom_config ?? {}), lineHeight: p.id })}
                      className={`rounded-lg border-2 px-1 py-2 text-xs font-medium transition-all ${
                        isActive
                          ? "border-teal-500 bg-teal-50 text-teal-700"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                      title={`${p.label} (${p.value})`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Vertical density of entry description lines.
              </p>
            </div>
          </div>
        )}

        {/* Colors tab */}
        {activeTab === "colors" && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Color Palettes
              </label>
              <div className="space-y-2">
                {COLOR_PALETTES.map((pal) => {
                  const isActive = (design.custom_config?.paletteId as string) === pal.id;
                  return (
                    <button
                      key={pal.id}
                      onClick={() => onApplyPalette(pal.id)}
                      className={`w-full text-left rounded-lg border-2 p-3 transition-all ${
                        isActive
                          ? "border-teal-500 bg-teal-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-900">{pal.label}</span>
                        {isActive && (
                          <span className="text-xs text-teal-600 font-medium">Active</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-7 h-7 rounded" style={{ backgroundColor: pal.primary }} />
                        <div className="w-7 h-7 rounded" style={{ backgroundColor: pal.accent }} />
                        <div className="w-7 h-7 rounded border border-gray-200" style={{ backgroundColor: pal.bg }} />
                        <div className="w-7 h-7 rounded" style={{ backgroundColor: pal.muted }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom colors — overrides that win over the palette */}
            <div className="pt-3 border-t border-gray-100 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                  Custom Colors
                </label>
                <p className="text-xs text-gray-400 mb-3">
                  Pick your own colors — these override the palette. Leave untouched to use the palette default.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <ColorField
                  label="Primary"
                  hint="Name & entry titles"
                  value={design.primary_color ?? ""}
                  fallback={getPalette(design.custom_config?.paletteId as string ?? "slate").primary}
                  onChange={(v) => onChange("primary_color", v)}
                  onClear={() => onChange("primary_color", null)}
                />
                <ColorField
                  label="Accent"
                  hint="Headings & details"
                  value={design.accent_color ?? ""}
                  fallback={getPalette(design.custom_config?.paletteId as string ?? "slate").accent}
                  onChange={(v) => onChange("accent_color", v)}
                  onClear={() => onChange("accent_color", null)}
                />
              </div>

              <div className="grid grid-cols-1">
                <ColorField
                  label="Subtitle"
                  hint="Professional title under name"
                  value={(design.custom_config?.subtitleColor as string) ?? ""}
                  fallback={
                    (design.accent_color as string) ||
                    getPalette(design.custom_config?.paletteId as string ?? "slate").accent
                  }
                  onChange={(v) => onChange("custom_config", { ...(design.custom_config ?? {}), subtitleColor: v })}
                  onClear={() => onChange("custom_config", { ...(design.custom_config ?? {}), subtitleColor: undefined })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <ColorField
                  label="Text"
                  hint="Body text"
                  value={(design.custom_config?.textColor as string) ?? ""}
                  fallback={getPalette(design.custom_config?.paletteId as string ?? "slate").text}
                  onChange={(v) => onChange("custom_config", { ...(design.custom_config ?? {}), textColor: v })}
                  onClear={() => onChange("custom_config", { ...(design.custom_config ?? {}), textColor: undefined })}
                />
                <ColorField
                  label="Muted"
                  hint="Years & organizations"
                  value={(design.custom_config?.mutedColor as string) ?? ""}
                  fallback={getPalette(design.custom_config?.paletteId as string ?? "slate").muted}
                  onChange={(v) => onChange("custom_config", { ...(design.custom_config ?? {}), mutedColor: v })}
                  onClear={() => onChange("custom_config", { ...(design.custom_config ?? {}), mutedColor: undefined })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <ColorField
                  label="Background"
                  hint="Page background"
                  value={(design.custom_config?.marginColor as string) ?? ""}
                  fallback={getPalette(design.custom_config?.paletteId as string ?? "slate").bg}
                  onChange={(v) => onChange("custom_config", { ...(design.custom_config ?? {}), marginColor: v })}
                  onClear={() => onChange("custom_config", { ...(design.custom_config ?? {}), marginColor: undefined })}
                />
                <ColorField
                  label="Dividers"
                  hint="Lines & surfaces"
                  value={(design.custom_config?.surfaceColor as string) ?? ""}
                  fallback={getPalette(design.custom_config?.paletteId as string ?? "slate").surface}
                  onChange={(v) => onChange("custom_config", { ...(design.custom_config ?? {}), surfaceColor: v })}
                  onClear={() => onChange("custom_config", { ...(design.custom_config ?? {}), surfaceColor: undefined })}
                />
              </div>
            </div>
          </div>
        )}

        {/* Layout tab */}
        {activeTab === "layout" && (
          <div className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Border Radius
                <span className="ml-1 text-teal-600 normal-case tracking-normal">
                  {design.border_radius ?? 8}px
                </span>
              </label>
              <input
                type="range"
                min={0}
                max={24}
                value={design.border_radius ?? 8}
                onChange={(e) => onChange("border_radius", parseInt(e.target.value))}
                className="w-full accent-teal-600"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>Sharp</span>
                <span>Round</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Page Margin
                <span className="ml-1 text-teal-600 normal-case tracking-normal">
                  {design.page_margin ?? 48}px
                </span>
              </label>
              <input
                type="range"
                min={16}
                max={96}
                step={4}
                value={design.page_margin ?? 48}
                onChange={(e) => onChange("page_margin", parseInt(e.target.value))}
                className="w-full accent-teal-600"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>Narrow</span>
                <span>Wide</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Margin Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={(design.custom_config?.marginColor as string) ?? "#ffffff"}
                  onChange={(e) => onChange("custom_config", { ...(design.custom_config ?? {}), marginColor: e.target.value })}
                  className="w-10 h-9 rounded-lg border border-gray-300 cursor-pointer"
                />
                <span className="text-xs text-gray-500">Page background color around content</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Profile Image
              </label>
              <div className="space-y-3">
                {/* Image position: left or right */}
                <div>
                  <span className="block text-xs font-medium text-gray-500 mb-1.5">Position</span>
                  <div className="flex items-center bg-white rounded-md p-0.5 border border-gray-200">
                    <button
                      onClick={() => onChange("custom_config", { ...(design.custom_config ?? {}), profileImagePosition: "left" })}
                      className={`flex-1 px-2 py-1.5 text-xs rounded transition-colors ${
                        (design.custom_config?.profileImagePosition as string) !== "right"
                          ? "bg-teal-50 text-teal-600 font-medium"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      Left
                    </button>
                    <button
                      onClick={() => onChange("custom_config", { ...(design.custom_config ?? {}), profileImagePosition: "right" })}
                      className={`flex-1 px-2 py-1.5 text-xs rounded transition-colors ${
                        (design.custom_config?.profileImagePosition as string) === "right"
                          ? "bg-teal-50 text-teal-600 font-medium"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      Right
                    </button>
                  </div>
                </div>

                {/* Rim toggle */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(design.custom_config?.profileRim as boolean) ?? true}
                    onChange={(e) => onChange("custom_config", { ...(design.custom_config ?? {}), profileRim: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-xs text-gray-600">Show rim/border around photo</span>
                </label>
                {/* Roundedness slider */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Corner roundness
                    <span className="ml-1 text-teal-600">
                      {(design.custom_config?.profileRadius as number) ?? 48}px
                    </span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={48}
                    value={(design.custom_config?.profileRadius as number) ?? 48}
                    onChange={(e) => onChange("custom_config", { ...(design.custom_config ?? {}), profileRadius: parseInt(e.target.value) })}
                    className="w-full accent-teal-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                    <span>Square</span>
                    <span>Circle</span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Page Breaks
              </label>
              <p className="text-xs text-gray-400 mb-2">
                Content flows onto each page automatically and fills the remaining space. To force a section onto a fresh page, expand it in the editor and tick &quot;Page break before&quot;.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Save button */}
      <div className="border-t border-gray-200 p-4 flex-shrink-0" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        <button
          onClick={onSave}
          disabled={!dirty || saving}
          className="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Saving..." : "Save Design"}
        </button>
      </div>
    </div>
  );
}

// ─── ColorField: swatch + native picker + hex input + clear ─────────────────

interface ColorFieldProps {
  label: string;
  hint: string;
  /** Current override value, "" when unset */
  value: string;
  /** Palette default shown when unset */
  fallback: string;
  onChange: (value: string) => void;
  onClear: () => void;
}

export function ColorField({ label, hint, value, fallback, onChange, onClear }: ColorFieldProps) {
  const isSet = Boolean(value);
  const shown = value || fallback;

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <div className="relative flex-shrink-0">
          <input
            type="color"
            value={shown}
            onChange={(e) => onChange(e.target.value)}
            className="w-9 h-9 rounded-lg border border-gray-300 cursor-pointer p-0.5"
            title={isSet ? "Change custom color" : "Pick a custom color"}
          />
        </div>
        <input
          type="text"
          value={value}
          placeholder={fallback}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (/^#[0-9a-fA-F]{3}$/.test(v) || /^#[0-9a-fA-F]{6}$/.test(v) || v === "") {
              onChange(v);
            } else {
              onChange(v); // let the hex input be loose; preview validates
            }
          }}
          className="w-full min-w-0 rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-mono bg-white focus:border-teal-500 focus:outline-none"
          spellCheck={false}
        />
        {isSet && (
          <button
            onClick={onClear}
            className="flex-shrink-0 text-gray-300 hover:text-teal-600 p-1 rounded hover:bg-teal-50 transition-colors"
            title="Reset to palette default"
            aria-label={`Reset ${label} to palette default`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>
      <span className="block text-xs text-gray-400 mt-1">{hint}</span>
    </div>
  );
}