"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";

import type {
  SectionWithEntries,
  CVDesign,
  SectionType,
  EntrySortMode,
  EntryWithTranslations,
} from "@/types/database";
import {
  SortableSectionCard,
  SECTION_TYPES,
  SORT_MODES,
  LANGUAGES,
} from "@/components/editor-client";
import { CVPreview } from "@/components/cv-preview";
import { DesignSidebar } from "@/components/design-sidebar";
import { getTemplate, getPalette } from "@/lib/design-constants";
import { exportToPdf } from "@/lib/pdf-export";
import {
  getProfilePicture,
  setProfilePicture,
  removeProfilePicture,
} from "@/lib/profile-picture";
import {
  getDemoSections,
  getDemoDesign,
  getDemoProfile,
  genDemoId,
} from "@/lib/demo-data";

type ViewMode = "edit" | "preview" | "split";

export function DemoEditor() {
  const [sections, setSections] = useState<SectionWithEntries[]>(() => getDemoSections());
  const [design, setDesign] = useState<CVDesign | null>(null);
  const [profileName, setProfileName] = useState(getDemoProfile().name);
  const [profileTitle, setProfileTitle] = useState(getDemoProfile().title);
  const [activeLang, setActiveLang] = useState("hu");
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [designForm, setDesignForm] = useState<Partial<CVDesign>>(() => getDemoDesign());
  const [designDirty, setDesignDirty] = useState(false);
  const [designSaved, setDesignSaved] = useState(false);
  const [pageBreaks, setPageBreaks] = useState<number[]>([]);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [profilePicture, setProfilePictureState] = useState<string | null>(null);
  const [includePhotoInPdf, setIncludePhotoInPdf] = useState(true);
  const previewRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const resetDemo = useCallback(() => {
    if (!confirm("Reset all demo data to the original sample? This will undo all your changes.")) return;
    setSections(getDemoSections());
    setDesign(null);
    setDesignForm(getDemoDesign());
    setProfileName(getDemoProfile().name);
    setProfileTitle(getDemoProfile().title);
    setActiveLang("hu");
    setPageBreaks([]);
    setDesignDirty(false);
    setDesignSaved(false);
  }, []);

  // Load profile picture from localStorage on mount
  useEffect(() => {
    const stored = getProfilePicture();
    if (stored) setProfilePictureState(stored);
  }, []);

  // ─── Photo handlers ────────────────────────────────────────────────────────

  const handlePhotoUpload = async (file: File) => {
    try {
      const stored = await setProfilePicture(file);
      setProfilePictureState(stored);
    } catch (err) {
      console.error("Failed to upload photo:", err);
    }
  };

  const handlePhotoRemove = () => {
    removeProfilePicture();
    setProfilePictureState(null);
  };

  // ─── PDF export handler ──────────────────────────────────────────────────────

  const handleExportPdf = async () => {
    if (!previewRef.current) return;
    setPdfExporting(true);
    try {
      await exportToPdf(previewRef.current, {
        profileName: profileName || "CV",
        includePhoto: includePhotoInPdf,
      });
    } catch (err) {
      console.error("Failed to export PDF:", err);
    } finally {
      setPdfExporting(false);
    }
  };

  // ─── Section handlers (local only) ──────────────────────────────────────

  const handleAddSection = () => {
    const newSection: SectionWithEntries = {
      id: genDemoId("sec"),
      cv_id: "demo-cv",
      title: "Új szekció",
      section_type: "custom",
      is_enabled: true,
      sort_order: sections.length,
      entry_sort_mode: "year_desc",
      layout_config: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      entries: [],
    };
    setSections([...sections, newSection]);
  };

  const handleUpdateSection = (id: string, patch: Partial<SectionWithEntries>) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const handleDeleteSection = (id: string) => {
    if (!confirm("Delete this section and all its entries?")) return;
    setSections((prev) => prev.filter((s) => s.id !== id));
  };

  const handleToggleSection = (id: string, enabled: boolean) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, is_enabled: enabled } : s)));
  };

  const handleDragEndSection = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = sections.map((s) => s.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    setSections(arrayMove(sections, oldIndex, newIndex));
  };

  const handleSortModeChange = (sectionId: string, mode: EntrySortMode) => {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        let entries = [...s.entries];
        if (mode === "year_asc") {
          entries.sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
        } else if (mode === "year_desc") {
          entries.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
        }
        return { ...s, entry_sort_mode: mode, entries };
      })
    );
  };

  // ─── Entry handlers (local only) ────────────────────────────────────────

  const handleAddEntry = (sectionId: string) => {
    const newEntry: EntryWithTranslations = {
      id: genDemoId("entry"),
      section_id: sectionId,
      year: new Date().getFullYear(),
      is_enabled: true,
      sort_order: 0,
      data: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      translations: [],
    };
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? { ...s, entries: [...s.entries, newEntry] }
          : s
      )
    );
  };

  const handleUpdateEntry = (entryId: string, sectionId: string, patch: Record<string, unknown>) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              entries: s.entries.map((e) => (e.id === entryId ? { ...e, ...patch } : e)),
            }
          : s
      )
    );
  };

  const handleDeleteEntry = (entryId: string, sectionId: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? { ...s, entries: s.entries.filter((e) => e.id !== entryId) }
          : s
      )
    );
  };

  const handleToggleEntry = (entryId: string, sectionId: string, enabled: boolean) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              entries: s.entries.map((e) => (e.id === entryId ? { ...e, is_enabled: enabled } : e)),
            }
          : s
      )
    );
  };

  const handleDragEndEntry = (sectionId: string, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    const ids = section.entries.map((e) => e.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    const newEntries = arrayMove(section.entries, oldIndex, newIndex);
    setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, entries: newEntries } : s)));
  };

  // ─── Translation handlers (local only) ──────────────────────────────────

  const handleSaveTranslation = (
    entryId: string,
    sectionId: string,
    lang: string,
    fields: { title: string; organization: string; description: string }
  ) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              entries: s.entries.map((e) => {
                if (e.id !== entryId) return e;
                const existing = e.translations.findIndex((t) => t.language === lang);
                const trData = {
                  id: existing >= 0 ? e.translations[existing].id : genDemoId("tr"),
                  entry_id: entryId,
                  language: lang,
                  title: fields.title || null,
                  organization: fields.organization || null,
                  description: fields.description || null,
                  data: {},
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                };
                if (existing >= 0) {
                  const translations = [...e.translations];
                  translations[existing] = trData;
                  return { ...e, translations };
                }
                return { ...e, translations: [...e.translations, trData] };
              }),
            }
          : s
      )
    );
  };

  const handleDeleteTranslation = (entryId: string, sectionId: string, lang: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              entries: s.entries.map((e) =>
                e.id === entryId
                  ? { ...e, translations: e.translations.filter((t) => t.language !== lang) }
                  : e
              ),
            }
          : s
      )
    );
  };

  // ─── Design handlers (local only) ────────────────────────────────────────

  const handleDesignChange = (field: string, value: unknown) => {
    setDesignForm((prev) => ({ ...prev, [field]: value }));
    setDesignDirty(true);
    setDesignSaved(false);
  };

  const handleApplyTemplate = (templateId: string) => {
    const tpl = getTemplate(templateId);
    const pal = getPalette(tpl.defaultPalette);
    setDesignForm((prev) => ({
      ...prev,
      template: templateId,
      font_family: tpl.defaultFont,
      primary_color: pal.primary,
      accent_color: pal.accent,
      custom_config: { ...(prev.custom_config ?? {}), paletteId: tpl.defaultPalette },
    }));
    setDesignDirty(true);
    setDesignSaved(false);
  };

  const handleApplyPalette = (paletteId: string) => {
    const pal = getPalette(paletteId);
    setDesignForm((prev) => ({
      ...prev,
      primary_color: pal.primary,
      accent_color: pal.accent,
      custom_config: { ...(prev.custom_config ?? {}), paletteId },
    }));
    setDesignDirty(true);
    setDesignSaved(false);
  };

  const handleSaveDesign = () => {
    setDesign(designForm as CVDesign);
    setDesignDirty(false);
    setDesignSaved(true);
    setTimeout(() => setDesignSaved(false), 2000);
  };

  // ─── Section layout config ──────────────────────────────────────────────

  const handleSectionLayoutChange = (sectionId: string, layoutKey: string, value: unknown) => {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    const newConfig = { ...section.layout_config, [layoutKey]: value };
    handleUpdateSection(sectionId, { layout_config: newConfig });
  };

  // ─── Page break handlers ────────────────────────────────────────────────

  const handleAddPageBreak = (afterIdx: number) => {
    if (!pageBreaks.includes(afterIdx + 1)) {
      setPageBreaks([...pageBreaks, afterIdx + 1].sort((a, b) => a - b));
    }
  };

  const handleRemovePageBreak = (idx: number) => {
    setPageBreaks(pageBreaks.filter((b) => b !== idx));
  };

  const showEditor = viewMode === "edit" || viewMode === "split";
  const showPreview = viewMode === "preview" || viewMode === "split";

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Top toolbar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center justify-between gap-4 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-gray-900">CV Editor</h1>
          <span className="text-xs text-amber-600 font-medium px-2 py-0.5 bg-amber-50 rounded">
            Demo Mode
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            {(["edit", "split", "preview"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  viewMode === mode
                    ? "bg-white text-teal-600 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {mode === "edit" ? "Edit" : mode === "split" ? "Split" : "Preview"}
              </button>
            ))}
          </div>

          {/* Language switcher */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => setActiveLang(lang.code)}
                title={lang.full}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  activeLang === lang.code
                    ? "bg-white text-teal-600 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>

          {/* Design sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              sidebarOpen
                ? "bg-teal-50 text-teal-600"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Design
          </button>

          {/* Reset demo */}
          <button
            onClick={resetDemo}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
          >
            Reset Demo
          </button>

          {/* PDF export */}
          <button
            onClick={handleExportPdf}
            disabled={pdfExporting || !sections.length}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
          >
            {pdfExporting ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Exporting...
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.293a1 1 0 011.414 0L9 11.586V3a1 1 0 112 0v8.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" />
                </svg>
                Export PDF
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Design sidebar */}
        {sidebarOpen && (
          <div className="w-72 flex-shrink-0 overflow-y-auto max-h-[calc(100vh-56px)]">
            <DesignSidebar
              design={designForm}
              dirty={designDirty}
              saving={false}
              saved={designSaved}
              onChange={handleDesignChange}
              onSave={handleSaveDesign}
              onApplyTemplate={handleApplyTemplate}
              onApplyPalette={handleApplyPalette}
              onSidebarClose={() => setSidebarOpen(false)}
            />
          </div>
        )}

        {/* Editor + Preview area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Editor pane */}
          {showEditor && (
            <div
              className={`overflow-y-auto max-h-[calc(100vh-56px)] ${
                viewMode === "split" ? "w-1/2 border-r border-gray-200" : "flex-1"
              }`}
            >
              <div className="p-6 space-y-4">
                {/* Profile info inputs */}
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Profile Header
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      placeholder="Full name"
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                    />
                    <input
                      type="text"
                      value={profileTitle}
                      onChange={(e) => setProfileTitle(e.target.value)}
                      placeholder="Professional title"
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                    />
                  </div>

                  {/* Profile picture */}
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-start gap-4">
                      {profilePicture ? (
                        <img
                          src={profilePicture}
                          alt="Profile"
                          className="w-16 h-16 rounded-full object-cover border-2 border-gray-200"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-xs">
                          No photo
                        </div>
                      )}
                      <div className="flex-1 space-y-2">
                        <div className="flex gap-2">
                          <label className="cursor-pointer px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors">
                            {profilePicture ? "Change photo" : "Upload photo"}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handlePhotoUpload(file);
                              }}
                            />
                          </label>
                          {profilePicture && (
                            <button
                              onClick={handlePhotoRemove}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1">
                          Photo stays in your browser only — not uploaded to any server.
                        </p>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={includePhotoInPdf}
                            onChange={(e) => setIncludePhotoInPdf(e.target.checked)}
                            className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                          />
                          <span className="text-xs text-gray-600">Include photo in exported PDF</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sortable sections */}
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEndSection}
                  modifiers={[restrictToVerticalAxis]}
                >
                  <SortableContext
                    items={sections.map((s) => s.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-3">
                      {sections.map((section, sectionIdx) => (
                        <SortableSectionCard
                          key={section.id}
                          section={section}
                          activeLang={activeLang}
                          sensors={sensors}
                          onUpdate={(patch) => handleUpdateSection(section.id, patch)}
                          onDelete={() => handleDeleteSection(section.id)}
                          onToggle={(enabled) => handleToggleSection(section.id, enabled)}
                          onSortModeChange={(mode) => handleSortModeChange(section.id, mode)}
                          onAddEntry={() => handleAddEntry(section.id)}
                          onUpdateEntry={(entryId, patch) => handleUpdateEntry(entryId, section.id, patch)}
                          onDeleteEntry={(entryId) => handleDeleteEntry(entryId, section.id)}
                          onToggleEntry={(entryId, enabled) => handleToggleEntry(entryId, section.id, enabled)}
                          onSaveTranslation={(entryId, lang, fields) =>
                            handleSaveTranslation(entryId, section.id, lang, fields)
                          }
                          onDeleteTranslation={(entryId, lang) =>
                            handleDeleteTranslation(entryId, section.id, lang)
                          }
                          onDragEndEntry={(event) => handleDragEndEntry(section.id, event)}
                          onLayoutChange={(key, val) => handleSectionLayoutChange(section.id, key, val)}
                          onAddPageBreak={() => handleAddPageBreak(sectionIdx)}
                          hasPageBreakAfter={pageBreaks.includes(sectionIdx + 1)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>

                {/* Add section */}
                <button
                  onClick={handleAddSection}
                  className="w-full rounded-xl border-2 border-dashed border-gray-300 py-3 text-gray-500 hover:border-teal-400 hover:text-teal-600 transition-colors"
                >
                  + Add Section
                </button>
              </div>
            </div>
          )}

          {/* Preview pane */}
          {showPreview && (
            <div
              ref={previewRef}
              className={`overflow-y-auto bg-gray-200 max-h-[calc(100vh-56px)] ${
                viewMode === "split" ? "w-1/2" : "flex-1"
              }`}
            >
              <div className="p-6">
                <CVPreview
                  sections={sections}
                  design={designForm}
                  activeLang={activeLang}
                  pageBreaks={pageBreaks}
                  profileName={profileName}
                  profileTitle={profileTitle}
                  profilePicture={includePhotoInPdf ? profilePicture : null}
                  showPageBreaks
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}