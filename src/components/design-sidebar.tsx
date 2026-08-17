"use client";

import { useState } from "react";
import type { CVDesign, Spacing } from "@/types/database";
import {
  FONT_OPTIONS,
  COLOR_PALETTES,
  TEMPLATES,
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
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
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
            <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
              Saved
            </span>
          )}
          {onSidebarClose && (
            <button
              onClick={onSidebarClose}
              className="text-gray-400 hover:text-gray-700 text-lg leading-none"
            >
              x
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

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
                  Primary
                </label>
                <div className="relative">
                  <input
                    type="color"
                    value={design.primary_color ?? "#1a1a1a"}
                    onChange={(e) => onChange("primary_color", e.target.value)}
                    className="w-full h-9 rounded-lg border border-gray-300 cursor-pointer"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
                  Accent
                </label>
                <div className="relative">
                  <input
                    type="color"
                    value={design.accent_color ?? "#14b8a6"}
                    onChange={(e) => onChange("accent_color", e.target.value)}
                    className="w-full h-9 rounded-lg border border-gray-300 cursor-pointer"
                  />
                </div>
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
                Page Management
              </label>
              <div className="space-y-2">
                <button
                  onClick={() => onChange("page_mode", "auto")}
                  className={`w-full rounded-lg border-2 px-3 py-2 text-xs font-medium transition-all ${
                    (design.custom_config?.pageMode as string) !== "manual"
                      ? "border-teal-500 bg-teal-50 text-teal-700"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  Auto-arrange content
                </button>
                <button
                  onClick={() => onChange("page_mode", "manual")}
                  className={`w-full rounded-lg border-2 px-3 py-2 text-xs font-medium transition-all ${
                    (design.custom_config?.pageMode as string) === "manual"
                      ? "border-teal-500 bg-teal-50 text-teal-700"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  Manual page breaks
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Save button */}
      <div className="border-t border-gray-200 p-4 flex-shrink-0">
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