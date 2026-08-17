"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
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
} from "@/components/editor-client";
import { LanguageManager } from "@/components/language-manager";
import type { CustomLanguage } from "@/lib/languages";
import { DEMO_LANGUAGES, saveLanguages, loadLanguages } from "@/lib/languages";
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

const DEMO_SECTIONS_KEY = "cvcreator:demo-sections";
const DEMO_PROFILE_KEY = "cvcreator:demo-profile";

// ─── localStorage persistence for demo mode ──────────────────────────────────

function loadDemoSections(): SectionWithEntries[] {
  if (typeof window === "undefined") return getDemoSections();
  try {
    const raw = localStorage.getItem(DEMO_SECTIONS_KEY);
    if (!raw) return getDemoSections();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return getDemoSections();
    return parsed;
  } catch {
    return getDemoSections();
  }
}

function saveDemoSections(sections: SectionWithEntries[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DEMO_SECTIONS_KEY, JSON.stringify(sections));
  } catch {
    // storage full or blocked — non-fatal
  }
}

function loadDemoProfile(): { name: string; title: string } {
  if (typeof window === "undefined") return getDemoProfile();
  try {
    const raw = localStorage.getItem(DEMO_PROFILE_KEY);
    if (!raw) return getDemoProfile();
    return JSON.parse(raw);
  } catch {
    return getDemoProfile();
  }
}

function saveDemoProfile(name: string, title: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DEMO_PROFILE_KEY, JSON.stringify({ name, title }));
  } catch {
    // non-fatal
  }
}

export function DemoEditor() {
  const [sections, setSections] = useState<SectionWithEntries[]>(() => loadDemoSections());
  const [design, setDesign] = useState<CVDesign | null>(null);
  const [profileName, setProfileName] = useState(() => loadDemoProfile().name);
  const [profileTitle, setProfileTitle] = useState(() => loadDemoProfile().title);
  const [activeLang, setActiveLang] = useState("hu");
  const [languages, setLanguages] = useState<CustomLanguage[]>(DEMO_LANGUAGES);
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    typeof window !== "undefined" && window.innerWidth < 768 ? "edit" : "split"
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Mobile detection — on mobile, use edit/preview toggle instead of split
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < 768
  );
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Auto-switch from split to edit when entering mobile
  useEffect(() => {
    if (isMobile && viewMode === "split") setViewMode("edit");
  }, [isMobile, viewMode]);

  // On mobile, default sidebar to closed
  useEffect(() => {
    if (window.innerWidth < 1024) setSidebarOpen(false);
  }, []);
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
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
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
    setLanguages(DEMO_LANGUAGES);
    setPageBreaks([]);
    setDesignDirty(false);
    setDesignSaved(false);
    // Clear localStorage so reload also gets fresh demo data
    if (typeof window !== "undefined") {
      localStorage.removeItem(DEMO_SECTIONS_KEY);
      localStorage.removeItem(DEMO_PROFILE_KEY);
      localStorage.removeItem("cvcreator:custom-languages");
    }
  }, []);

  // Load profile picture from localStorage on mount
  useEffect(() => {
    const stored = getProfilePicture();
    if (stored) setProfilePictureState(stored);
  }, []);

  // Persist sections (including translations) to localStorage on change
  useEffect(() => {
    saveDemoSections(sections);
  }, [sections]);

  // Persist profile name/title to localStorage on change
  useEffect(() => {
    saveDemoProfile(profileName, profileTitle);
  }, [profileName, profileTitle]);

  // Load custom languages from localStorage on mount
  useEffect(() => {
    // For demo mode: if no languages stored, seed with demo languages (HU, EN, DE, FR)
    const stored = loadLanguages();
    if (stored.length === 0) {
      setLanguages(DEMO_LANGUAGES);
      saveLanguages(DEMO_LANGUAGES);
    } else {
      setLanguages(stored);
      if (!stored.find((l) => l.code === activeLang)) {
        setActiveLang(stored[0].code);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLanguagesChange = (updated: CustomLanguage[]) => {
    setLanguages(updated);
    saveLanguages(updated);
  };

  // ─── Photo handlers ────────────────────────────────────────────────────────

  const [photoError, setPhotoError] = useState<string | null>(null);

  const handlePhotoUpload = async (file: File) => {
    setPhotoError(null);
    try {
      const stored = await setProfilePicture(file);
      setProfilePictureState(stored);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Failed to upload photo");
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

  const showEditor = viewMode === "edit" || (!isMobile && viewMode === "split");
  const showPreview = viewMode === "preview" || (!isMobile && viewMode === "split");

  return (
    <div className="h-full bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col overflow-hidden min-h-0">
      {/* Top toolbar */}
      <div className="bg-white border-b border-gray-200 px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2 sm:gap-4 flex-shrink-0 z-30">
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <h1 className="text-lg font-bold text-gray-900">CV Editor</h1>
          <span className="text-xs text-amber-600 font-medium px-2 py-0.5 bg-amber-50 rounded">
            Demo Mode
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
          {/* View mode toggle — mobile shows edit/preview only, desktop adds split */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            {isMobile ? (
              // Mobile: edit / preview toggle with icons
              <>
                <button
                  onClick={() => setViewMode("edit")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${
                    viewMode === "edit"
                      ? "bg-white text-teal-600 shadow-sm"
                      : "text-gray-500"
                  }`}
                  aria-label="Edit mode"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-9 9-4 1 1-4 1 1 4-1 1 9-9z" clipRule="evenodd" fillRule="evenodd" />
                  </svg>
                  Edit
                </button>
                <button
                  onClick={() => setViewMode("preview")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${
                    viewMode === "preview"
                      ? "bg-white text-teal-600 shadow-sm"
                      : "text-gray-500"
                  }`}
                  aria-label="Preview mode"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                    <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                  </svg>
                  Preview
                </button>
              </>
            ) : (
              // Desktop: edit / split / preview
              (["edit", "split", "preview"] as ViewMode[]).map((mode) => (
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
              ))
            )}
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

          {/* Reset demo */}
          <button
            onClick={resetDemo}
            className="px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
          >
            <span className="hidden sm:inline">Reset Demo</span>
            <span className="sm:hidden">Reset</span>
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
        </div>
      </div>

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
            <div className="w-72 flex-shrink-0 overflow-y-auto h-full fixed lg:relative z-50 lg:z-auto top-0 left-0 bottom-0 lg:inset-auto">
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
          </>
        )}

        {/* Editor + Preview area */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-w-0 min-h-0">
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
                    Your Profile
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      placeholder="Full name"
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:border-teal-500 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={profileTitle}
                      onChange={(e) => setProfileTitle(e.target.value)}
                      placeholder="Professional title"
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:border-teal-500 focus:outline-none"
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
                        <p className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1 italic">
                          Photo stays in your browser only — not uploaded to any server.
                        </p>
                        {photoError && (
                          <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                            {photoError}
                          </p>
                        )}
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={includePhotoInPdf}
                            onChange={(e) => setIncludePhotoInPdf(e.target.checked)}
                            className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                          />
                          <span className="text-xs text-gray-600 italic">Include photo in exported PDF</span>
                        </label>
                      </div>
                    </div>
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
                          onSaveTranslation={(entryId, lang, fields) =>
                            handleSaveTranslation(entryId, section.id, lang, fields)
                          }
                          onDeleteTranslation={(entryId, lang) =>
                            handleDeleteTranslation(entryId, section.id, lang)
                          }
                          onDragEndEntry={(event) => handleDragEndEntry(section.id, event)}
                          onLayoutChange={(key, val) => handleSectionLayoutChange(section.id, key, val)}
                          onAddPageBreak={() => handleAddPageBreak(sectionIdx)}
                          onRemovePageBreak={() => handleRemovePageBreak(sectionIdx + 1)}
                          hasPageBreakAfter={pageBreaks.includes(sectionIdx + 1)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>

                {/* Add section */}
                <button
                  onClick={handleAddSection}
                  className="w-full rounded-xl border-2 border-dashed border-teal-300 bg-gradient-to-b from-teal-50/50 to-teal-50/20 py-4 text-teal-700 font-semibold hover:from-teal-50 hover:to-teal-100 hover:border-teal-500 transition-all flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
                  </svg>
                  Add Section
                </button>
              </div>
            </div>
          )}

          {/* Preview pane */}
          {showPreview && (
            <div
              ref={previewRef}
              className={`overflow-y-auto bg-gray-200 min-w-0 min-h-0 ${
                viewMode === "split"
                  ? "flex-1 lg:h-full lg:w-1/2 lg:flex-initial"
                  : "flex-1 h-full"
              }`}
            >
              <div className="p-4 sm:p-6">
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