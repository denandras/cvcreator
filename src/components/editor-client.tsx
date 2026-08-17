"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";

import { useAuth } from "@/lib/auth-context";
import type {
  SectionWithEntries,
  CVDesign,
  SectionType,
  EntrySortMode,
} from "@/types/database";
import {
  getSections,
  createSection,
  updateSection,
  deleteSection,
  toggleSectionEnabled,
  reorderSections,
  setEntrySortMode,
  createEntry,
  updateEntry,
  deleteEntry,
  toggleEntryEnabled,
  reorderEntries,
  upsertTranslation,
  deleteTranslation,
} from "@/app/actions/cv-actions";
import { getDesign, saveDesign, getUserCVs } from "@/app/actions/design-actions";
import { CVPreview } from "@/components/cv-preview";
import { DesignSidebar } from "@/components/design-sidebar";
import { getTemplate, getPalette } from "@/lib/design-constants";
import {
  getProfilePicture,
  setProfilePicture,
  removeProfilePicture,
} from "@/lib/profile-picture";
import { exportToPdf } from "@/lib/pdf-export";
import type { CustomLanguage } from "@/lib/languages";
import { ensureLanguages, saveLanguages } from "@/lib/languages";
import { LanguageManager } from "@/components/language-manager";

export const SECTION_TYPES: SectionType[] = [
  "education",
  "experience",
  "skills",
  "awards",
  "projects",
  "custom",
];

export const SORT_MODES: EntrySortMode[] = ["year_asc", "year_desc", "custom"];

// Replaced hardcoded LANGUAGES — now user-managed custom languages
export const DEFAULT_LANGUAGES: CustomLanguage[] = [
  { code: "hu", label: "HU", full: "Hungarian" },
  { code: "en", label: "EN", full: "English" },
];

type ViewMode = "edit" | "preview" | "split";

export function EditorClient() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [cvId, setCvId] = useState<string | null>(null);
  const [sections, setSections] = useState<SectionWithEntries[]>([]);
  const [design, setDesign] = useState<CVDesign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeLang, setActiveLang] = useState("hu");

  // Custom languages — user-managed, persisted to localStorage
  const [languages, setLanguages] = useState<CustomLanguage[]>(DEFAULT_LANGUAGES);

  // View mode: edit / preview / split
  const [viewMode, setViewMode] = useState<ViewMode>("edit");

  // Design sidebar
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Design form state (explicit save)
  const [designForm, setDesignForm] = useState<Partial<CVDesign>>({});
  const [designDirty, setDesignDirty] = useState(false);
  const [designSaving, setDesignSaving] = useState(false);
  const [designSaved, setDesignSaved] = useState(false);

  // Profile info for preview header
  const [profileName, setProfileName] = useState("");
  const [profileTitle, setProfileTitle] = useState("");

  // Page breaks — indices into the sections array where breaks occur
  const [pageBreaks, setPageBreaks] = useState<number[]>([]);

  // Profile picture — stored locally in browser only
  const [profilePicture, setProfilePictureState] = useState<string | null>(null);
  const [includePhotoInPdf, setIncludePhotoInPdf] = useState(true);
  const [pdfExporting, setPdfExporting] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Load CV data
  const loadData = useCallback(async () => {
    if (!cvId) return;
    setLoading(true);
    setError(null);
    try {
      const [sectionsData, designData] = await Promise.all([
        getSections(cvId),
        getDesign(cvId),
      ]);
      setSections(sectionsData);
      setDesign(designData);
      setDesignForm(designData ?? {});
      setDesignDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [cvId]);

  // On auth, fetch user's CVs and pick the first one
  useEffect(() => {
    if (!user) return;
    getUserCVs()
      .then((cvs) => {
        if (cvs.length > 0) {
          setCvId(cvs[0].id);
        }
      })
      .catch((err) => setError(err.message));
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load profile picture from localStorage on mount
  useEffect(() => {
    const stored = getProfilePicture();
    if (stored) setProfilePictureState(stored);
  }, []);

  // Load custom languages from localStorage on mount
  useEffect(() => {
    const stored = ensureLanguages();
    setLanguages(stored);
    // If active lang is not in stored languages, switch to first available
    if (stored.length > 0 && !stored.find((l) => l.code === activeLang)) {
      setActiveLang(stored[0].code);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLanguagesChange = (updated: CustomLanguage[]) => {
    setLanguages(updated);
    saveLanguages(updated);
  };

  // ─── Section handlers ────────────────────────────────────────────────────

  const handleAddSection = async () => {
    if (!cvId) return;
    try {
      const newSection = await createSection({
        cv_id: cvId,
        title: "New Section",
        section_type: "custom",
        sort_order: sections.length,
      });
      setSections([...sections, { ...newSection, entries: [] }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add section");
    }
  };

  const handleUpdateSection = async (
    id: string,
    patch: Partial<SectionWithEntries>
  ) => {
    try {
      await updateSection(id, patch);
      setSections((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update section");
    }
  };

  const handleDeleteSection = async (id: string) => {
    if (!confirm("Delete this section and all its entries?")) return;
    try {
      await deleteSection(id);
      setSections((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete section");
    }
  };

  const handleToggleSection = async (id: string, enabled: boolean) => {
    try {
      await toggleSectionEnabled(id, enabled);
      setSections((prev) =>
        prev.map((s) => (s.id === id ? { ...s, is_enabled: enabled } : s))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle section");
    }
  };

  const handleDragEndSection = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = sections.map((s) => s.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    const newSections = arrayMove(sections, oldIndex, newIndex);
    setSections(newSections);
    try {
      await reorderSections(cvId!, newSections.map((s) => s.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reorder");
      setSections(sections); // revert
    }
  };

  const handleSortModeChange = async (sectionId: string, mode: EntrySortMode) => {
    try {
      await setEntrySortMode(sectionId, mode);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change sort mode");
    }
  };

  // ─── Entry handlers ──────────────────────────────────────────────────────

  const handleAddEntry = async (sectionId: string) => {
    try {
      const section = sections.find((s) => s.id === sectionId);
      const newEntry = await createEntry(sectionId, {
        year: new Date().getFullYear(),
        sort_order: section?.entries.length ?? 0,
      });
      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionId
            ? { ...s, entries: [...s.entries, { ...newEntry, translations: [] }] }
            : s
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add entry");
    }
  };

  const handleUpdateEntry = async (
    entryId: string,
    sectionId: string,
    patch: Record<string, unknown>
  ) => {
    try {
      await updateEntry(entryId, patch);
      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionId
            ? {
                ...s,
                entries: s.entries.map((e) =>
                  e.id === entryId ? { ...e, ...patch } : e
                ),
              }
            : s
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update entry");
    }
  };

  const handleDeleteEntry = async (entryId: string, sectionId: string) => {
    try {
      await deleteEntry(entryId);
      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionId
            ? { ...s, entries: s.entries.filter((e) => e.id !== entryId) }
            : s
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete entry");
    }
  };

  const handleToggleEntry = async (
    entryId: string,
    sectionId: string,
    enabled: boolean
  ) => {
    try {
      await toggleEntryEnabled(entryId, enabled);
      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionId
            ? {
                ...s,
                entries: s.entries.map((e) =>
                  e.id === entryId ? { ...e, is_enabled: enabled } : e
                ),
              }
            : s
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle entry");
    }
  };

  const handleDragEndEntry = async (
    sectionId: string,
    event: DragEndEvent
  ) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    const ids = section.entries.map((e) => e.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    const newEntries = arrayMove(section.entries, oldIndex, newIndex);
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId ? { ...s, entries: newEntries } : s
      )
    );
    try {
      await reorderEntries(sectionId, newEntries.map((e) => e.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reorder entries");
    }
  };

  // ─── Translation handlers ────────────────────────────────────────────────

  const handleSaveTranslation = async (
    entryId: string,
    sectionId: string,
    lang: string,
    fields: { title: string; organization: string; description: string }
  ) => {
    try {
      const translation = await upsertTranslation({
        entry_id: entryId,
        language: lang,
        title: fields.title || null,
        organization: fields.organization || null,
        description: fields.description || null,
      });
      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionId
            ? {
                ...s,
                entries: s.entries.map((e) => {
                  if (e.id !== entryId) return e;
                  const existing = e.translations.findIndex(
                    (t) => t.language === lang
                  );
                  if (existing >= 0) {
                    const translations = [...e.translations];
                    translations[existing] = translation;
                    return { ...e, translations };
                  }
                  return { ...e, translations: [...e.translations, translation] };
                }),
              }
            : s
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save translation");
    }
  };

  const handleDeleteTranslation = async (
    entryId: string,
    sectionId: string,
    lang: string
  ) => {
    try {
      await deleteTranslation(entryId, lang);
      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionId
            ? {
                ...s,
                entries: s.entries.map((e) =>
                  e.id === entryId
                    ? {
                        ...e,
                        translations: e.translations.filter(
                          (t) => t.language !== lang
                        ),
                      }
                    : e
                ),
              }
            : s
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete translation");
    }
  };

  // ─── Design handlers ──────────────────────────────────────────────────────

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
      custom_config: {
        ...(prev.custom_config ?? {}),
        paletteId: tpl.defaultPalette,
      },
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
      custom_config: {
        ...(prev.custom_config ?? {}),
        paletteId,
      },
    }));
    setDesignDirty(true);
    setDesignSaved(false);
  };

  const handleSaveDesign = async () => {
    if (!cvId) return;
    setDesignSaving(true);
    try {
      const saved = await saveDesign(cvId, designForm);
      setDesign(saved);
      setDesignDirty(false);
      setDesignSaved(true);
      setTimeout(() => setDesignSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save design");
    } finally {
      setDesignSaving(false);
    }
  };

  // ─── Section layout config ──────────────────────────────────────────────

  const handleSectionLayoutChange = async (
    sectionId: string,
    layoutKey: string,
    value: unknown
  ) => {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    const newConfig = { ...section.layout_config, [layoutKey]: value };
    await handleUpdateSection(sectionId, { layout_config: newConfig });
  };

  // ─── Page break handlers ──────────────────────────────────────────────────

  const handleAddPageBreak = (afterIdx: number) => {
    if (!pageBreaks.includes(afterIdx + 1)) {
      setPageBreaks([...pageBreaks, afterIdx + 1].sort((a, b) => a - b));
    }
  };

  const handleRemovePageBreak = (idx: number) => {
    setPageBreaks(pageBreaks.filter((b) => b !== idx));
  };

  // ─── Profile picture handlers ────────────────────────────────────────────────

  const handlePhotoUpload = async (file: File) => {
    try {
      const stored = await setProfilePicture(file);
      setProfilePictureState(stored);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload photo");
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
      setError(err instanceof Error ? err.message : "Failed to export PDF");
    } finally {
      setPdfExporting(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-full overflow-y-auto p-8">
        <p className="text-gray-700">Please sign in.</p>
      </div>
    );
  }

  const showEditor = viewMode === "edit" || viewMode === "split";
  const showPreview = viewMode === "preview" || viewMode === "split";

  return (
    <div className="h-full bg-gray-100 flex flex-col overflow-hidden min-h-0">
      {/* Top toolbar */}
      <div className="bg-white border-b border-gray-200 px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2 sm:gap-4 flex-shrink-0 z-30">
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <h1 className="text-lg font-bold text-gray-900">CV Editor</h1>
          <span className="text-xs text-gray-400 hidden md:inline">{user.email}</span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
          {/* View mode toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            {(["edit", "split", "preview"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  viewMode === mode
                    ? "bg-white text-teal-600 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {mode === "edit" ? "Edit" : mode === "split" ? "Split" : "Preview"}
              </button>
            ))}
          </div>

          {/* Language switcher — custom languages */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => setActiveLang(lang.code)}
                title={lang.full}
                className={`px-2 sm:px-2.5 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  activeLang === lang.code
                    ? "bg-white text-teal-600 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {lang.label}
              </button>
            ))}
            {languages.length === 0 && (
              <span className="px-2.5 py-1.5 text-xs text-gray-400">No languages</span>
            )}
          </div>

          {/* Design sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              sidebarOpen
                ? "bg-teal-50 text-teal-600"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Design
          </button>

          {/* PDF export */}
          <button
            onClick={handleExportPdf}
            disabled={pdfExporting || !sections.length}
            className="px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
          >
            {pdfExporting ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                <span className="hidden sm:inline">Exporting...</span>
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.293a1 1 0 011.414 0L9 11.586V3a1 1 0 112 0v8.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" />
                </svg>
                <span className="hidden sm:inline">Export PDF</span>
              </>
            )}
          </button>

          <button
            onClick={() => signOut()}
            className="text-xs text-gray-400 hover:text-gray-700 px-1.5 sm:px-2"
          >
            <span className="hidden sm:inline">Sign Out</span>
            <span className="sm:hidden">⎋</span>
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-3 sm:mx-4 mt-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm flex justify-between items-center flex-shrink-0">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-900 font-bold flex-shrink-0 ml-2">
            x
          </button>
        </div>
      )}

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden relative min-h-0">
        {/* Design sidebar — overlay on mobile, fixed sidebar on desktop */}
        {sidebarOpen && (
          <>
            {/* Mobile backdrop */}
            <div
              className="lg:hidden fixed inset-0 bg-black/30 z-40"
              onClick={() => setSidebarOpen(false)}
            />
            <div className="w-72 flex-shrink-0 overflow-y-auto h-full absolute lg:relative z-50 lg:z-auto inset-y-0 left-0 lg:inset-auto">
              <DesignSidebar
                design={designForm}
                dirty={designDirty}
                saving={designSaving}
                saved={designSaved}
                onChange={handleDesignChange}
                onSave={handleSaveDesign}
                onApplyTemplate={handleApplyTemplate}
                onApplyPalette={handleApplyPalette}
                onSidebarClose={() => setSidebarOpen(false)}
              />
            </div>
          </>
        )}

        {/* Editor + Preview area */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-w-0 min-h-0">
          {loading ? (
            <div className="flex-1 flex items-center justify-center min-h-0">
              <p className="text-gray-500">Loading CV data...</p>
            </div>
          ) : (
            <>
              {/* Editor pane */}
              {showEditor && (
                <div
                  className={`overflow-y-auto min-w-0 min-h-0 ${
                    viewMode === "split"
                      ? "flex-1 lg:h-full lg:w-1/2 lg:border-r lg:border-gray-200 lg:flex-initial"
                      : "flex-1 h-full"
                  }`}
                >
                  <div className="p-4 sm:p-6 space-y-4">
                    {/* Profile info inputs */}
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                        Profile Header
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-3">
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

                      {/* Profile picture upload */}
                      <div className="border-t border-gray-100 pt-3">
                        <div className="flex items-center gap-3">
                          {profilePicture ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={profilePicture}
                              alt="Profile preview"
                              className="w-16 h-16 rounded-lg object-cover border-2 border-gray-200"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-lg bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-xs text-center">
                              No photo
                            </div>
                          )}
                          <div className="flex-1 space-y-1.5">
                            <label className="inline-block">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handlePhotoUpload(file);
                                  e.target.value = "";
                                }}
                                className="hidden"
                              />
                              <span className="cursor-pointer text-xs font-medium text-teal-600 hover:text-teal-700 px-3 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 transition-colors inline-block">
                                {profilePicture ? "Change photo" : "Upload photo"}
                              </span>
                            </label>
                            {profilePicture && (
                              <button
                                onClick={handlePhotoRemove}
                                className="block text-xs text-red-500 hover:text-red-700"
                              >
                                Remove photo
                              </button>
                            )}
                          </div>
                        </div>
                        {/* Local storage notice */}
                        <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                          <svg className="h-4 w-4 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          <span>Your photo stays in this browser only. It is never uploaded to a server.</span>
                        </div>
                        {/* Include in PDF toggle */}
                        <label className="mt-2 flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={includePhotoInPdf}
                            onChange={(e) => setIncludePhotoInPdf(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                          />
                          <span className="text-xs text-gray-600">Include photo in exported PDF</span>
                        </label>
                      </div>
                    </div>

                    {/* Language management */}
                    <LanguageManager
                      languages={languages}
                      onChange={handleLanguagesChange}
                      activeLang={activeLang}
                      onActiveLangChange={setActiveLang}
                    />

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
                              languages={languages}
                              sensors={sensors}
                              onUpdate={(patch) => handleUpdateSection(section.id, patch)}
                              onDelete={() => handleDeleteSection(section.id)}
                              onToggle={(enabled) => handleToggleSection(section.id, enabled)}
                              onSortModeChange={(mode) => handleSortModeChange(section.id, mode)}
                              onAddEntry={() => handleAddEntry(section.id)}
                              onUpdateEntry={(entryId, patch) => handleUpdateEntry(entryId, section.id, patch)}
                              onDeleteEntry={(entryId) => handleDeleteEntry(entryId, section.id)}
                              onToggleEntry={(entryId, enabled) => handleToggleEntry(entryId, section.id, enabled)}
                              onSaveTranslation={(entryId, lang, fields) => handleSaveTranslation(entryId, section.id, lang, fields)}
                              onDeleteTranslation={(entryId, lang) => handleDeleteTranslation(entryId, section.id, lang)}
                              onDragEndEntry={(event) => handleDragEndEntry(section.id, event)}
                              onLayoutChange={(key, val) => handleSectionLayoutChange(section.id, key, val)}
                              onAddPageBreak={() => handleAddPageBreak(sectionIdx)}
                              hasPageBreakAfter={pageBreaks.includes(sectionIdx + 1)}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>

                    {/* Add section + page break */}
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
                  className={`overflow-y-auto bg-gray-200 min-w-0 min-h-0 ${
                    viewMode === "split"
                      ? "flex-1 lg:h-full lg:w-1/2 lg:flex-initial"
                      : "flex-1 h-full"
                  }`}
                >
                  <div className="p-4 sm:p-6" ref={previewRef}>
                    <CVPreview
                      sections={sections}
                      design={designForm}
                      activeLang={activeLang}
                      pageBreaks={pageBreaks}
                      profileName={profileName}
                      profileTitle={profileTitle}
                      showPageBreaks
                      profilePicture={includePhotoInPdf ? profilePicture : null}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sortable Section Card ───────────────────────────────────────────────────

export interface SortableSectionCardProps {
  section: SectionWithEntries;
  activeLang: string;
  languages: CustomLanguage[];
  sensors: ReturnType<typeof useSensors>;
  onUpdate: (patch: Partial<SectionWithEntries>) => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
  onSortModeChange: (mode: EntrySortMode) => void;
  onAddEntry: () => void;
  onUpdateEntry: (entryId: string, patch: Record<string, unknown>) => void;
  onDeleteEntry: (entryId: string) => void;
  onToggleEntry: (entryId: string, enabled: boolean) => void;
  onSaveTranslation: (
    entryId: string,
    lang: string,
    fields: { title: string; organization: string; description: string }
  ) => void;
  onDeleteTranslation: (entryId: string, lang: string) => void;
  onDragEndEntry: (event: DragEndEvent) => void;
  onLayoutChange: (key: string, value: unknown) => void;
  onAddPageBreak: () => void;
  hasPageBreakAfter: boolean;
}

export function SortableSectionCard(props: SortableSectionCardProps) {
  const { section, sensors, languages } = props;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [expanded, setExpanded] = useState(true);

  const currentColumns = (section.layout_config?.columns as string) ?? "auto";
  const currentHeading = (section.layout_config?.headingStyle as string) ?? "auto";

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`rounded-xl border bg-white overflow-hidden transition-shadow ${
          section.is_enabled ? "border-gray-200" : "border-gray-200 opacity-60"
        } ${isDragging ? "shadow-lg ring-2 ring-teal-300" : ""}`}
      >
        {/* Section header */}
        <div className="flex items-center gap-2 p-3 flex-wrap">
          {/* Drag handle */}
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 px-1 py-2"
            title="Drag to reorder"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <circle cx="3" cy="3" r="1.5" />
              <circle cx="3" cy="7" r="1.5" />
              <circle cx="3" cy="11" r="1.5" />
              <circle cx="11" cy="3" r="1.5" />
              <circle cx="11" cy="7" r="1.5" />
              <circle cx="11" cy="11" r="1.5" />
            </svg>
          </button>

          {/* Enable/disable checkbox */}
          <label className="flex items-center cursor-pointer" title="Enable/disable in preview & PDF">
            <input
              type="checkbox"
              checked={section.is_enabled}
              onChange={(e) => props.onToggle(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
          </label>

          {/* Title */}
          <input
            type="text"
            value={section.title}
            onChange={(e) => props.onUpdate({ title: e.target.value })}
            onBlur={() => props.onUpdate({ title: section.title })}
            className="flex-1 min-w-[120px] font-medium text-gray-900 bg-transparent border-b border-transparent focus:border-teal-500 focus:outline-none px-1 py-1"
          />

          {/* Section type + Sort mode */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <select
              value={section.section_type}
              onChange={(e) => props.onUpdate({ section_type: e.target.value as SectionType })}
              className="text-xs rounded-md border border-gray-300 px-2 py-1 bg-white text-gray-600"
            >
              {SECTION_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            <select
              value={section.entry_sort_mode}
              onChange={(e) => props.onSortModeChange(e.target.value as EntrySortMode)}
              className="text-xs rounded-md border border-gray-300 px-2 py-1 bg-white text-gray-600"
            >
              {SORT_MODES.map((m) => (
                <option key={m} value={m}>{m.replace("_", " ")}</option>
              ))}
            </select>
          </div>

          {/* Expand/collapse + Delete */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-gray-400 hover:text-gray-700 px-1.5 py-1"
            >
              {expanded ? "\u2212" : "+"}
            </button>

            <button
              onClick={props.onDelete}
              className="text-red-400 hover:text-red-600 px-1 py-1 text-xs"
            >
              del
            </button>
          </div>
        </div>

        {/* Section layout options bar */}
        {expanded && (
          <div className="px-3 pb-2 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">Cols:</span>
              <div className="flex items-center bg-gray-50 rounded-md p-0.5">
                {["auto", "one", "two"].map((c) => (
                  <button
                    key={c}
                    onClick={() => props.onLayoutChange("columns", c)}
                    className={`px-2 py-0.5 text-xs rounded transition-colors ${
                      currentColumns === c
                        ? "bg-white text-teal-600 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {c === "auto" ? "Auto" : c === "one" ? "1-col" : "2-col"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">Heading:</span>
              <select
                value={currentHeading}
                onChange={(e) => props.onLayoutChange("headingStyle", e.target.value)}
                className="text-xs rounded-md border border-gray-200 px-1.5 py-0.5 bg-gray-50 text-gray-600"
              >
                <option value="auto">Auto</option>
                <option value="underline">Underline</option>
                <option value="border">Border</option>
                <option value="filled">Filled</option>
                <option value="minimal">Minimal</option>
              </select>
            </div>
          </div>
        )}

        {/* Entries with drag-and-drop */}
        {expanded && (
          <div className="px-3 pb-3 space-y-2">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={props.onDragEndEntry}
              modifiers={[restrictToVerticalAxis]}
            >
              <SortableContext
                items={section.entries.map((e) => e.id)}
                strategy={verticalListSortingStrategy}
              >
                {section.entries.map((entry) => {
                  const translation = entry.translations.find(
                    (t) => t.language === props.activeLang
                  );
                  return (
                    <SortableEntryRow
                      key={entry.id}
                      entry={entry}
                      translation={translation}
                      activeLang={props.activeLang}
                      languages={languages}
                      onUpdate={(patch) => props.onUpdateEntry(entry.id, patch)}
                      onDelete={() => props.onDeleteEntry(entry.id)}
                      onToggle={(enabled) => props.onToggleEntry(entry.id, enabled)}
                      onSaveTranslation={(lang, fields) => props.onSaveTranslation(entry.id, lang, fields)}
                      onDeleteTranslation={(lang) => props.onDeleteTranslation(entry.id, lang)}
                    />
                  );
                })}
              </SortableContext>
            </DndContext>

            <button
              onClick={props.onAddEntry}
              className="w-full text-xs text-gray-400 hover:text-teal-600 py-2 border border-dashed border-gray-200 rounded-lg hover:border-teal-300 transition-colors"
            >
              + Add Entry
            </button>
          </div>
        )}
      </div>

      {/* Page break indicator */}
      {props.hasPageBreakAfter ? (
        <div className="flex items-center justify-center py-2">
          <div className="flex-1 border-t-2 border-dashed border-red-300" />
          <button
            onClick={() => {}}
            className="mx-2 text-xs text-red-400 font-medium"
          >
            Page break
          </button>
          <button
            onClick={() => {}}
            className="text-xs text-red-400 hover:text-red-600 mx-1"
          >
            remove
          </button>
          <div className="flex-1 border-t-2 border-dashed border-red-300" />
        </div>
      ) : (
        <div className="flex justify-center -my-1 relative z-10">
          <button
            onClick={props.onAddPageBreak}
            className="text-xs text-gray-300 hover:text-red-400 opacity-0 hover:opacity-100 transition-opacity py-0.5"
          >
            + page break
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Sortable Entry Row ──────────────────────────────────────────────────────

export interface SortableEntryRowProps {
  entry: SectionWithEntries["entries"][0];
  translation?: SectionWithEntries["entries"][0]["translations"][0];
  activeLang: string;
  languages: CustomLanguage[];
  onUpdate: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
  onSaveTranslation: (
    lang: string,
    fields: { title: string; organization: string; description: string }
  ) => void;
  onDeleteTranslation: (lang: string) => void;
}

export function SortableEntryRow({
  entry,
  translation,
  activeLang,
  languages,
  onUpdate,
  onDelete,
  onToggle,
  onSaveTranslation,
  onDeleteTranslation,
}: SortableEntryRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [title, setTitle] = useState(translation?.title ?? "");
  const [organization, setOrganization] = useState(translation?.organization ?? "");
  const [description, setDescription] = useState(translation?.description ?? "");
  const [showLangEditor, setShowLangEditor] = useState(false);

  useEffect(() => {
    setTitle(translation?.title ?? "");
    setOrganization(translation?.organization ?? "");
    setDescription(translation?.description ?? "");
  }, [translation?.title, translation?.organization, translation?.description]);

  const handleSaveLang = () => {
    onSaveTranslation(activeLang, { title, organization, description });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-2 p-2.5 rounded-lg bg-gray-50 group ${
        !entry.is_enabled ? "opacity-50" : ""
      } ${isDragging ? "ring-2 ring-teal-300 shadow-md" : ""}`}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 mt-1 flex-shrink-0"
        title="Drag to reorder"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
          <circle cx="2" cy="2" r="1.2" />
          <circle cx="2" cy="6" r="1.2" />
          <circle cx="2" cy="10" r="1.2" />
          <circle cx="10" cy="2" r="1.2" />
          <circle cx="10" cy="6" r="1.2" />
          <circle cx="10" cy="10" r="1.2" />
        </svg>
      </button>

      {/* Enable/disable checkbox */}
      <input
        type="checkbox"
        checked={entry.is_enabled}
        onChange={(e) => onToggle(e.target.checked)}
        className="h-4 w-4 mt-1 rounded border-gray-300 text-teal-600 focus:ring-teal-500 flex-shrink-0"
      />

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex gap-2 flex-wrap">
          <input
            type="number"
            value={entry.year ?? ""}
            onChange={(e) => {
              const year = e.target.value ? parseInt(e.target.value) : null;
              onUpdate({ year });
            }}
            placeholder="Year"
            className="w-20 text-sm rounded border border-gray-300 px-2 py-1 bg-white flex-shrink-0"
          />
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleSaveLang}
            placeholder="Title"
            className="flex-1 min-w-[100px] text-sm rounded border border-gray-300 px-2 py-1 bg-white"
          />
          <input
            type="text"
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            onBlur={handleSaveLang}
            placeholder="Organization"
            className="flex-1 min-w-[100px] text-sm rounded border border-gray-300 px-2 py-1 bg-white"
          />
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={handleSaveLang}
          placeholder="Description"
          rows={2}
          className="w-full text-sm rounded border border-gray-300 px-2 py-1 bg-white resize-y"
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">
            Lang: {activeLang} ({entry.translations.length} translations)
          </span>
          <button
            onClick={() => setShowLangEditor(!showLangEditor)}
            className="text-xs text-teal-500 hover:underline"
          >
            {showLangEditor ? "Hide" : "Manage translations"}
          </button>
        </div>
        {showLangEditor && (
          <div className="mt-2 space-y-2 p-3 bg-white rounded-lg border border-gray-200">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
              Translations
            </div>
            {languages.length === 0 && (
              <p className="text-xs text-gray-400">Add a language first to create translations.</p>
            )}
            {languages.map((lang) => {
              const t = entry.translations.find((tr) => tr.language === lang.code);
              return (
                <TranslationEditorRow
                  key={lang.code}
                  lang={lang}
                  translation={t}
                  onSave={(fields) => onSaveTranslation(lang.code, fields)}
                  onDelete={() => onDeleteTranslation(lang.code)}
                />
              );
            })}
          </div>
        )}
      </div>

      <button
        onClick={onDelete}
        className="text-red-400 hover:text-red-600 text-sm px-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        del
      </button>
    </div>
  );
}

// ─── Translation Editor Row (editable per-language) ─────────────────────────

interface TranslationEditorRowProps {
  lang: CustomLanguage;
  translation?: SectionWithEntries["entries"][0]["translations"][0];
  onSave: (fields: { title: string; organization: string; description: string }) => void;
  onDelete: () => void;
}

function TranslationEditorRow({ lang, translation, onSave, onDelete }: TranslationEditorRowProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(translation?.title ?? "");
  const [organization, setOrganization] = useState(translation?.organization ?? "");
  const [description, setDescription] = useState(translation?.description ?? "");

  // Sync local state when translation changes externally
  useEffect(() => {
    if (!editing) {
      setTitle(translation?.title ?? "");
      setOrganization(translation?.organization ?? "");
      setDescription(translation?.description ?? "");
    }
  }, [translation?.title, translation?.organization, translation?.description, editing]);

  const handleSave = () => {
    onSave({ title, organization, description });
    setEditing(false);
  };

  const handleCancel = () => {
    setTitle(translation?.title ?? "");
    setOrganization(translation?.organization ?? "");
    setDescription(translation?.description ?? "");
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-gray-50 hover:bg-gray-100 transition-colors">
        <span className="text-xs font-bold text-teal-600 w-8">{lang.label}</span>
        <div className="flex-1 text-xs text-gray-600 truncate">
          {translation
            ? [translation.title, translation.organization].filter(Boolean).join(" — ") || "Empty"
            : <span className="text-gray-400 italic">Not translated</span>}
        </div>
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-teal-600 hover:text-teal-700 font-medium"
        >
          {translation ? "Edit" : "Add"}
        </button>
        {translation && (
          <button
            onClick={onDelete}
            className="text-xs text-red-400 hover:text-red-600"
            title="Remove translation"
          >
            remove
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="px-2 py-2 rounded-md bg-white border border-teal-200 space-y-1.5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-bold text-teal-600">{lang.label}</span>
        <span className="text-xs text-gray-500">{lang.full}</span>
      </div>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="w-full text-xs rounded border border-gray-300 px-2 py-1 bg-white focus:border-teal-500 focus:outline-none"
      />
      <input
        type="text"
        value={organization}
        onChange={(e) => setOrganization(e.target.value)}
        placeholder="Organization"
        className="w-full text-xs rounded border border-gray-300 px-2 py-1 bg-white focus:border-teal-500 focus:outline-none"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description"
        rows={2}
        className="w-full text-xs rounded border border-gray-300 px-2 py-1 bg-white resize-y focus:border-teal-500 focus:outline-none"
      />
      <div className="flex gap-1.5 justify-end">
        <button
          onClick={handleCancel}
          className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="text-xs text-white bg-teal-600 hover:bg-teal-700 px-3 py-1 rounded font-medium"
        >
          Save
        </button>
      </div>
    </div>
  );
}