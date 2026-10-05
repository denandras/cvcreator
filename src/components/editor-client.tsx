"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";

import { useAuth } from "@/lib/auth-context";
import type {
  SectionWithEntries,
  CVDesign,
  EntrySortMode,
} from "@/types/database";
import {
  getSections,
  createSection,
  updateSection,
  deleteSection,
  duplicateSection,
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
import {
  getDesign,
  saveDesign,
  getUserCVs,
  getProfileInfo,
  saveProfileInfo,
} from "@/app/actions/design-actions";
import { CVPreview } from "@/components/cv-preview";
import { DesignSidebar } from "@/components/design-sidebar";
import { getTemplate } from "@/lib/design-constants";
import {
  getProfilePicture,
  setProfilePicture,
  removeProfilePicture,
} from "@/lib/profile-picture";
import { exportToPdf, type PdfCVData } from "@/lib/pdf-export";
import type { CustomLanguage } from "@/lib/languages";
import { ensureLanguages, saveLanguages, ensurePrimaryLanguage, savePrimaryLanguage } from "@/lib/languages";
import { LanguageManager } from "@/components/language-manager";
import { TranslationPanel } from "@/components/translation-panel";

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

  // Primary language — the main CV language (others are translations)
  const [primaryLang, setPrimaryLang] = useState("hu");

  // View mode: edit / preview / split
  const [viewMode, setViewMode] = useState<ViewMode>("edit");

  // Design sidebar
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // On mobile, default sidebar to closed
  useEffect(() => {
    if (window.innerWidth < 1024) setSidebarOpen(false);
  }, []);

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

  // Design form state (explicit save)
  const [designForm, setDesignForm] = useState<Partial<CVDesign>>({});
  const [designDirty, setDesignDirty] = useState(false);
  const [designSaving, setDesignSaving] = useState(false);
  const [designSaved, setDesignSaved] = useState(false);

  // Profile info for preview header (primary-language values + per-language overrides)
  const [profileName, setProfileName] = useState("");
  const [profileTitle, setProfileTitle] = useState("");
  const [profileTranslations, setProfileTranslations] = useState<
    Record<string, { name: string; title: string }>
  >({});

  // Resolved values for the active language: secondary-language override if
  // present (non-empty), otherwise the primary-language value.
  const activeProfile = (() => {
    if (activeLang !== primaryLang) {
      const t = profileTranslations[activeLang];
      if (t && (t.name || t.title)) {
        return { name: t.name, title: t.title };
      }
    }
    return { name: profileName, title: profileTitle };
  })();

  // Page breaks: per-section layout_config.page_break_before — no separate state

  // Profile picture — stored locally in browser only
  const [profilePicture, setProfilePictureState] = useState<string | null>(null);
  const [includePhotoInPdf, setIncludePhotoInPdf] = useState(true);
  const [pdfExporting, setPdfExporting] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Load CV data
  const loadData = useCallback(async () => {
    if (!cvId) return;
    setLoading(true);
    setError(null);
    try {
      const [sectionsData, designData, profileInfo] = await Promise.all([
        getSections(cvId),
        getDesign(cvId),
        getProfileInfo(cvId),
      ]);
      setSections(sectionsData);
      setDesign(designData);
      setDesignForm(designData ?? {});
      setDesignDirty(false);
      setProfileName(profileInfo.profileName);
      setProfileTitle(profileInfo.profileTitle);
      setProfileTranslations(profileInfo.profileTranslations ?? {});
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
    // Ensure primary language is set
    const primary = ensurePrimaryLanguage(stored);
    setPrimaryLang(primary);
    // If active lang is not in stored languages, switch to primary
    if (stored.length > 0 && !stored.find((l) => l.code === activeLang)) {
      setActiveLang(primary);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLanguagesChange = (updated: CustomLanguage[]) => {
    setLanguages(updated);
    saveLanguages(updated);
    // If primary language was removed, reset to first available
    if (updated.length > 0 && !updated.find((l) => l.code === primaryLang)) {
      const newPrimary = updated[0].code;
      setPrimaryLang(newPrimary);
      savePrimaryLanguage(newPrimary);
    }
  };

  const handlePrimaryLangChange = (code: string) => {
    setPrimaryLang(code);
    savePrimaryLanguage(code);
  };

  // ─── Section handlers ────────────────────────────────────────────────────

  // Profile name/title — auto-save on blur (same convention as entries/sections)
  const handleProfileBlur = async () => {
    if (!cvId) return;
    try {
      await saveProfileInfo(cvId, profileName, profileTitle, profileTranslations);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile info");
    }
  };

  // Per-language profile translation (secondary language) — auto-save on blur
  const handleProfileTranslationBlur = async (
    field: "name" | "title"
  ) => {
    if (!cvId || activeLang === primaryLang) return;
    const current = profileTranslations[activeLang] ?? { name: "", title: "" };
    const next = {
      ...profileTranslations,
      [activeLang]: current,
    };
    // Drop empty language entries entirely (no ghost overrides)
    if (!current.name && !current.title) {
      delete next[activeLang];
    }
    try {
      await saveProfileInfo(cvId, profileName, profileTitle, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile info");
    }
  };

  const handleProfileTranslationChange = (
    field: "name" | "title",
    value: string
  ) => {
    const current = profileTranslations[activeLang] ?? { name: "", title: "" };
    setProfileTranslations((prev) => ({
      ...prev,
      [activeLang]: { ...current, [field]: value },
    }));
  };

  const handleAddSection = async () => {
    if (!cvId) return;
    try {
      const newSection = await createSection({
        cv_id: cvId,
        title: "New Section",
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

  const handleDuplicateSection = async (id: string) => {
    try {
      const copy = await duplicateSection(id);
      const source = sections.find((s) => s.id === id);
      if (!source) return;
      const duped: SectionWithEntries = {
        ...copy,
        entries: source.entries.map((e) => ({
          ...e,
          id: `${copy.id}:${e.id}`,
          section_id: copy.id,
          translations: e.translations.map((t) => ({ ...t, id: `${copy.id}:${t.id}`, entry_id: `${copy.id}:${e.id}` })),
        })),
      };
      const idx = sections.findIndex((s) => s.id === id);
      setSections((prev) => [...prev.slice(0, idx + 1), duped, ...prev.slice(idx + 1)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to duplicate section");
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
    if (!confirm("Delete this entry?")) return;
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
    setDesignForm((prev) => {
      const { textColor, mutedColor, marginColor, surfaceColor, ...restCfg } =
        (prev.custom_config ?? {}) as Record<string, unknown>;
      return {
        ...prev,
        template: templateId,
        font_family: tpl.defaultFont,
        primary_color: null,
        accent_color: null,
        custom_config: {
          ...restCfg,
          paletteId: tpl.defaultPalette,
        },
      };
    });
    setDesignDirty(true);
    setDesignSaved(false);
  };

  const handleApplyPalette = (paletteId: string) => {
    setDesignForm((prev) => {
      // Clear all custom color overrides — palette selection resets colors
      const { textColor, mutedColor, marginColor, surfaceColor, ...restCfg } =
        (prev.custom_config ?? {}) as Record<string, unknown>;
      return {
        ...prev,
        primary_color: null,
        accent_color: null,
        custom_config: {
          ...restCfg,
          paletteId,
        },
      };
    });
    setDesignDirty(true);
    setDesignSaved(false);
  };

  const handleSaveDesign = async () => {
    if (!cvId) return;
    setDesignSaving(true);
    try {
      // Preserve profile_name/profile_title in custom_config (they live there too)
      const merged: typeof designForm = {
        ...designForm,
        custom_config: {
          ...(designForm.custom_config ?? {}),
          profile_name: profileName.trim(),
          profile_title: profileTitle.trim(),
          profile_translations: profileTranslations,
        },
      };
      const saved = await saveDesign(cvId, merged);
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

  // ─── Profile picture handlers ────────────────────────────────────────────────

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
      const cvData: PdfCVData = {
        profileName: activeProfile.name,
        profileTitle: activeProfile.title,
        profilePicture: includePhotoInPdf ? profilePicture : null,
        sections,
        design: designForm,
        activeLang,
      };
      await exportToPdf(previewRef.current, {
        profileName: activeProfile.name || "CV",
        includePhoto: includePhotoInPdf,
        cvData,
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

  const showEditor = viewMode === "edit" || (!isMobile && viewMode === "split");
  const showPreview = viewMode === "preview" || (!isMobile && viewMode === "split");

  return (
    <div className="h-full bg-stone-100 flex flex-col overflow-hidden min-h-0">
      {/* Top toolbar — icon-only, no text labels */}
      <div className="bg-white border-b border-gray-200 px-3 py-2 flex items-center justify-between flex-shrink-0 z-30" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
        {/* View mode toggle — icons only */}
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
          {isMobile ? (
            <>
              <button
                onClick={() => setViewMode("edit")}
                className={`p-2 rounded-md transition-all ${
                  viewMode === "edit" ? "bg-white text-teal-600 shadow-sm" : "text-gray-500"
                }`}
                aria-label="Edit mode"
                title="Edit"
              >
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-9 9-4 1 1-4 1 1 4-1 1 9-9z" clipRule="evenodd" fillRule="evenodd" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode("preview")}
                className={`p-2 rounded-md transition-all ${
                  viewMode === "preview" ? "bg-white text-teal-600 shadow-sm" : "text-gray-500"
                }`}
                aria-label="Preview mode"
                title="Preview"
              >
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                  <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                </svg>
              </button>
            </>
          ) : (
            (["edit", "split", "preview"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`p-2 rounded-md transition-all ${
                  viewMode === mode ? "bg-white text-teal-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
                aria-label={`${mode} mode`}
                title={mode === "edit" ? "Edit" : mode === "split" ? "Split" : "Preview"}
              >
                {mode === "edit" ? (
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-9 9-4 1 1-4 1 1 4-1 1 9-9z" clipRule="evenodd" fillRule="evenodd" />
                  </svg>
                ) : mode === "split" ? (
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M3 3h6v14H3V3zm8 0h6v14h-6V3z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                    <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            ))
          )}
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1.5">
          {/* PDF export */}
          <button
            onClick={handleExportPdf}
            disabled={pdfExporting || !sections.length}
            className="p-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            aria-label="Export PDF"
            title="Export PDF"
          >
            {pdfExporting ? (
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.293a1 1 0 011.414 0L9 11.586V3a1 1 0 112 0v8.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" />
              </svg>
            )}
          </button>

          {/* Sign out */}
          <button
            onClick={() => signOut()}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
            aria-label="Sign out"
            title="Sign out"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 3h8a1 1 0 010 2H5v10h6a1 1 0 110 2H3V3zm10.293 4.293a1 1 0 011.414 0L17.414 10l-2.707 2.707a1 1 0 01-1.414-1.414L13.586 11H7a1 1 0 110-2h6.586l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-3 sm:mx-4 mt-2 p-3 bg-teal-50 text-gray-800 border border-teal-200 rounded-lg text-sm flex justify-between items-center flex-shrink-0">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-gray-500 font-bold flex-shrink-0 ml-2">
            x
          </button>
        </div>
      )}

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden relative min-h-0">
        {/* Design sidebar — slides in from the right, always mounted for smooth animation */}
        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-black/30 z-40 backdrop-fade-in"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        {/* Sidebar container — width animates on desktop for layout reflow */}
        <div
          className={`design-sidebar-container flex-shrink-0 overflow-hidden h-full ${
            sidebarOpen
              ? "w-72 lg:w-72"
              : "w-0 lg:w-0"
          } fixed lg:relative z-50 lg:z-auto top-0 right-0 bottom-0 lg:inset-auto`}
        >
          <div
            className={`design-sidebar-inner w-72 h-full overflow-y-auto ${
              sidebarOpen ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 lg:translate-x-full"
            }`}
          >
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
        </div>

        {/* Floating trigger button — appears on the right edge when sidebar is closed */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="design-trigger-pop fixed lg:absolute right-0 top-1/2 -translate-y-1/2 z-40 lg:z-30 bg-teal-600 text-white p-2.5 rounded-l-xl shadow-lg hover:bg-teal-700 transition-colors"
            aria-label="Open design panel"
            title="Open design panel"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M3 4h14v2H3V4zm0 4h10v2H3V8zm0 4h14v2H3v-2zm0 4h8v2H3v-2z" />
            </svg>
          </button>
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
                    {/* Language quick-switch — moved from header to edit pane */}
                    {languages.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                          {activeLang === primaryLang ? "Primary:" : "Translating:"}
                        </span>
                        <div className="flex items-center flex-wrap gap-0.5 bg-gray-100 rounded-lg p-0.5">
                          {languages.map((lang) => (
                            <button
                              key={lang.code}
                              onClick={() => setActiveLang(lang.code)}
                              title={lang.full + (lang.code === primaryLang ? " (primary)" : "")}
                              className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1 ${
                                activeLang === lang.code
                                  ? "bg-white text-teal-600 shadow-sm"
                                  : "text-gray-500 hover:text-gray-700"
                              }`}
                            >
                              {lang.code === primaryLang && (
                                <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                </svg>
                              )}
                              {lang.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {activeLang !== primaryLang ? (
                      /* ─── Translation mode — secondary language active ─── */
                      <>
                        {/* Language management */}
                        <LanguageManager
                          languages={languages}
                          onChange={handleLanguagesChange}
                          activeLang={activeLang}
                          onActiveLangChange={setActiveLang}
                          primaryLang={primaryLang}
                          onPrimaryLangChange={handlePrimaryLangChange}
                        />

                        {/* Profile info translation (name/title) */}
                        <div className="bg-white rounded-xl border border-gray-200 p-4">
                          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                            Profile — {languages.find((l) => l.code === activeLang)?.full ?? activeLang}
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <input
                              type="text"
                              value={profileTranslations[activeLang]?.name ?? ""}
                              onChange={(e) => handleProfileTranslationChange("name", e.target.value)}
                              onBlur={() => handleProfileTranslationBlur("name")}
                              placeholder={profileName || "Full name (primary)"}
                              className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:border-teal-500 focus:outline-none"
                            />
                            <input
                              type="text"
                              value={profileTranslations[activeLang]?.title ?? ""}
                              onChange={(e) => handleProfileTranslationChange("title", e.target.value)}
                              onBlur={() => handleProfileTranslationBlur("title")}
                              placeholder={profileTitle || "Professional title (primary)"}
                              className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:border-teal-500 focus:outline-none"
                            />
                          </div>
                          <p className="text-xs text-gray-400 mt-2">
                            Leave empty to fall back to the primary-language value.
                          </p>
                        </div>

                        {/* Translation panel */}
                        <TranslationPanel
                          sections={sections}
                          primaryLang={primaryLang}
                          secondaryLang={activeLang}
                          languages={languages}
                          onSaveTranslation={handleSaveTranslation}
                          onDeleteTranslation={handleDeleteTranslation}
                        />
                      </>
                    ) : (
                      /* ─── Primary language mode — full editing ─── */
                      <>
                    {/* Profile info inputs */}
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                        Your Profile
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <input
                          type="text"
                          value={profileName}
                          onChange={(e) => setProfileName(e.target.value)}
                          onBlur={handleProfileBlur}
                          placeholder="Full name"
                          className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:border-teal-500 focus:outline-none"
                        />
                        <input
                          type="text"
                          value={profileTitle}
                          onChange={(e) => setProfileTitle(e.target.value)}
                          onBlur={handleProfileBlur}
                          placeholder="Professional title"
                          className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:border-teal-500 focus:outline-none"
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
                                className="block text-xs text-gray-500 hover:text-gray-700"
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
                          <span className="text-xs text-amber-700 italic">Your photo stays in this browser only. It is never uploaded to a server.</span>
                        </div>
                        {photoError && (
                          <div className="mt-2 text-xs text-gray-700 bg-teal-50 rounded-lg px-3 py-2">
                            {photoError}
                          </div>
                        )}
                        {/* Include in PDF toggle */}
                        <label className="mt-2 flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={includePhotoInPdf}
                            onChange={(e) => setIncludePhotoInPdf(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                          />
                          <span className="text-xs text-gray-600 italic">Include photo in exported PDF</span>
                        </label>
                      </div>
                    </div>

                    {/* Language management */}
                    <LanguageManager
                      languages={languages}
                      onChange={handleLanguagesChange}
                      activeLang={activeLang}
                      onActiveLangChange={setActiveLang}
                      primaryLang={primaryLang}
                      onPrimaryLangChange={handlePrimaryLangChange}
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
                              onDuplicate={() => handleDuplicateSection(section.id)}
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
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>

                    {/* Add section + page break */}
                    <button
                      onClick={handleAddSection}
                      style={{ marginBottom: "max(1rem, env(safe-area-inset-bottom))" }}
                      className="w-full rounded-xl border-2 border-dashed border-teal-300 bg-gradient-to-b from-teal-50/50 to-teal-50/20 py-4 text-teal-700 font-semibold hover:from-teal-50 hover:to-teal-100 hover:border-teal-500 transition-all flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
                      </svg>
                      Add Section
                    </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Preview pane */}
              {showPreview && (
                <div
                  className={`overflow-y-auto bg-stone-200/70 min-w-0 min-h-0 ${
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
                      profileName={activeProfile.name}
                      profileTitle={activeProfile.title}
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
  onDuplicate?: () => void;
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

  // Start collapsed — sections expand on demand, keeping the editor scannable
  const [expanded, setExpanded] = useState(false);

  const currentColumns = (section.layout_config?.columns as string) ?? "auto";
  const pageBreakBefore = (section.layout_config?.page_break_before as boolean) === true;

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`rounded-xl border bg-white overflow-hidden transition-shadow ${
          section.is_enabled
            ? "border-gray-200 shadow-sm hover:shadow-md"
            : "border-gray-200 opacity-60 shadow-sm"
        } ${isDragging ? "shadow-lg ring-2 ring-teal-300" : ""}`}
      >
        {/* Section header */}
        <div className="flex items-center gap-2 p-3 flex-wrap bg-gradient-to-r from-gray-50 to-white">
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
          <label className="flex items-center cursor-pointer" title="Show/hide in preview & PDF">
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
            onBlur={() => props.onUpdate({ title: section.title.trim() })}
            className="flex-1 min-w-[120px] font-semibold text-gray-800 bg-transparent border-b border-transparent focus:border-teal-500 focus:outline-none px-1 py-1 text-sm"
          />

          {/* Sort mode */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <select
              value={section.entry_sort_mode}
              onChange={(e) => props.onSortModeChange(e.target.value as EntrySortMode)}
              className="text-xs rounded-lg border border-gray-200 px-2 py-1 bg-gray-50 text-gray-500"
            >
              <option value="year_desc">Newest first</option>
              <option value="year_asc">Oldest first</option>
              <option value="custom">Custom order</option>
            </select>
          </div>

          {/* Expand/collapse + Duplicate + Delete */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-gray-400 hover:text-gray-700 px-1.5 py-1 text-sm rounded hover:bg-gray-100 transition-colors"
              title={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? "\u2212" : "+"}
            </button>

            {props.onDuplicate && (
              <button
                onClick={props.onDuplicate}
                className="text-gray-400 hover:text-teal-600 hover:bg-teal-50 p-2 md:p-1.5 text-sm rounded-lg md:rounded transition-colors touch-target"
                title="Duplicate section"
                aria-label="Duplicate section"
              >
                <svg className="w-5 h-5 md:w-4 md:h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" />
                  <path d="M4 5a2 2 0 012-2h6a2 2 0 012 2v1H8a3 3 0 00-3 3v5H6a2 2 0 01-2-2V5z" />
                </svg>
              </button>
            )}

            <button
              onClick={props.onDelete}
              className="text-gray-400 hover:text-teal-700 hover:bg-teal-50 p-2 md:p-1.5 text-sm rounded-lg md:rounded transition-colors touch-target"
              title="Delete section"
              aria-label="Delete section"
            >
              <svg className="w-5 h-5 md:w-4 md:h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>

        {/* Section layout options bar */}
        {expanded && (
          <div className="px-3 pb-2 flex items-center gap-3 flex-wrap bg-gray-50/50">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">Columns:</span>
              <div className="flex items-center bg-white rounded-md p-0.5 border border-gray-200">
                {[["auto", "Auto"], ["one", "1-col"], ["two", "2-col"]].map(([c, label]) => (
                  <button
                    key={c}
                    onClick={() => props.onLayoutChange("columns", c)}
                    className={`px-2 py-0.5 text-xs rounded transition-colors ${
                      currentColumns === c
                        ? "bg-teal-50 text-teal-600 font-medium"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer" title="Always start this section at the top of a new page">
              <input
                type="checkbox"
                checked={pageBreakBefore}
                onChange={(e) => props.onLayoutChange("page_break_before", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-xs text-gray-500 select-none">Page break before</span>
            </label>
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
              className="w-full text-sm font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border-2 border-dashed border-teal-300 hover:border-teal-500 py-3 rounded-lg transition-all flex items-center justify-center gap-1.5 mt-1"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
              </svg>
              Add Entry
            </button>
          </div>
        )}
      </div>

      {/* Page break before this section is set via the layout options bar
          (checkbox) — a break marker between cards would imply a manual
          break system we no longer have. */}
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
  // Year is TEXT in the UI (accepts "2017", "2017-2021", "2024–"): the DB
  // column is int4, so only a value parseable as a year is persisted;
  // range strings display fine but the int column keeps leading digit year.
  const [yearText, setYearText] = useState(entry.year != null ? String(entry.year) : "");

  useEffect(() => {
    setTitle(translation?.title ?? "");
    setOrganization(translation?.organization ?? "");
    setDescription(translation?.description ?? "");
  }, [translation?.title, translation?.organization, translation?.description]);
  // Sync year field when the entry's year changes elsewhere (add-entry default).
  // data.year_text (free-text year, e.g. "2017-2021") wins over the int year.
  useEffect(() => {
    setYearText(
      (entry.data as { year_text?: string } | undefined)?.year_text ??
        (entry.year != null ? String(entry.year) : "")
    );
  }, [entry.year, entry.data]);

  const handleSaveLang = () => {
    onSaveTranslation(activeLang, {
      title: title.trim(),
      organization: organization.trim(),
      description: description.replace(/\n{3,}/g, "\n\n").trim(),
    });
  };

  // Persist the year freely on blur: a plain 4-digit year also writes the
  // int `year` column (sorting); ranges like "2017-2021" or "2024–" persist
  // verbatim in data.year_text (jsonb — the int column can't hold them) and
  // win over data in preview/PDF display.
  const handleYearBlur = () => {
    const t = yearText.trim();
    if (t === "") {
      const patch: Record<string, unknown> = { data: { ...(entry.data ?? {}), year_text: null } };
      if (entry.year != null) patch.year = null;
      if (entry.year != null || (entry.data as { year_text?: string } | undefined)?.year_text) {
        onUpdate(patch);
      }
      return;
    }
    const plain = t.match(/^\d{4}$/) ? parseInt(t, 10) : null;
    const patch: Record<string, unknown> = { data: { ...(entry.data ?? {}), year_text: t } };
    if (plain !== null && plain >= 1900 && plain <= 2999) {
      patch.year = plain;
    } else if (plain === null && entry.year != null) {
      // Range or free text: keep a numeric start year for sorting if the
      // text begins with a 4-digit year, else clear the int column.
      const m = t.match(/^(\d{4})/);
      patch.year = m ? parseInt(m[1], 10) : null;
    }
    onUpdate(patch);
  };

  // Count how many languages have translations for this entry
  const translatedCount = entry.translations.filter(
    (t) => t.title || t.organization || t.description
  ).length;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-2 p-3 rounded-lg bg-gray-50/80 border border-gray-100 group transition-colors hover:bg-gray-50 ${
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

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            inputMode="numeric"
            value={yearText}
            onChange={(e) => setYearText(e.target.value)}
            onBlur={handleYearBlur}
            placeholder="Year (2017–21 ok)"
            title="Year: a single year (2017) or a range (2017-2021 — stores the start year)"
            className="w-24 text-sm rounded-lg border border-gray-200 px-2 py-1.5 bg-white flex-shrink-0 focus:border-teal-500 focus:outline-none"
          />
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleSaveLang}
            placeholder="Title"
            className="flex-1 min-w-[100px] text-sm rounded-lg border border-gray-200 px-2 py-1.5 bg-white focus:border-teal-500 focus:outline-none"
          />
          <input
            type="text"
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            onBlur={handleSaveLang}
            placeholder="Organization"
            className="flex-1 min-w-[100px] text-sm rounded-lg border border-gray-200 px-2 py-1.5 bg-white focus:border-teal-500 focus:outline-none"
          />
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={handleSaveLang}
          placeholder="Description"
          rows={2}
          className="w-full text-sm rounded-lg border border-gray-200 px-2 py-1.5 bg-white resize-y focus:border-teal-500 focus:outline-none"
        />
        {/* Translation status indicator — no inline editor, translations done in TranslationPanel */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 italic">
            {translatedCount}/{languages.length} languages
          </span>
          {translatedCount < languages.length && (
            <span className="text-xs text-teal-500">
              Switch to a secondary language to translate
            </span>
          )}
        </div>
      </div>

      <button
        onClick={onDelete}
        className="text-gray-400 hover:text-gray-700 mt-1 p-2 md:p-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-shrink-0 rounded-lg md:rounded-none hover:bg-teal-50 md:hover:bg-transparent touch-target"
        title="Delete entry"
        aria-label="Delete entry"
      >
        <svg className="w-5 h-5 md:w-4 md:h-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
}