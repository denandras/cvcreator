"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import type {
  SectionWithEntries,
  CVDesign,
  CV,
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

const SECTION_TYPES: SectionType[] = [
  "education",
  "experience",
  "skills",
  "awards",
  "projects",
  "custom",
];

const SORT_MODES: EntrySortMode[] = ["year_asc", "year_desc", "custom"];

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hu", label: "Hungarian" },
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
];

export function EditorClient() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [cvId, setCvId] = useState<string | null>(null);
  const [sections, setSections] = useState<SectionWithEntries[]>([]);
  const [design, setDesign] = useState<CVDesign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeLang, setActiveLang] = useState("en");

  // Design form state (explicit save)
  const [designForm, setDesignForm] = useState<Partial<CVDesign>>({});
  const [designDirty, setDesignDirty] = useState(false);
  const [designSaving, setDesignSaving] = useState(false);
  const [designSaved, setDesignSaved] = useState(false);

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
    // Auto-save content
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

  const handleReorderSections = async (newOrder: string[]) => {
    try {
      await reorderSections(cvId!, newOrder);
      setSections((prev) => {
        const map = new Map(prev.map((s) => [s.id, s]));
        return newOrder
          .map((id, i) => {
            const s = map.get(id);
            return s ? { ...s, sort_order: i } : null;
          })
          .filter(Boolean) as SectionWithEntries[];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reorder sections");
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
    // Auto-save content
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
      setError(
        err instanceof Error ? err.message : "Failed to save translation"
      );
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
      setError(
        err instanceof Error ? err.message : "Failed to delete translation"
      );
    }
  };

  // ─── Design handlers (explicit save) ──────────────────────────────────────

  const handleDesignChange = (field: string, value: unknown) => {
    setDesignForm((prev) => ({ ...prev, [field]: value }));
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

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <p className="p-8">Please sign in.</p>;
  }

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">CV Editor</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{user.email}</span>
          <button
            onClick={() => signOut()}
            className="text-sm text-indigo-600 hover:underline"
          >
            Sign Out
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-900">
            x
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Loading CV data...</p>
      ) : (
        <>
          {/* Language switcher */}
          <div className="mb-4 flex items-center gap-2">
            <span className="text-sm font-medium text-gray-600">Language:</span>
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => setActiveLang(lang.code)}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  activeLang === lang.code
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>

          {/* Sections */}
          <div className="space-y-4 mb-6">
            {sections.map((section, sectionIdx) => (
              <SectionCard
                key={section.id}
                section={section}
                activeLang={activeLang}
                onMoveUp={
                  sectionIdx > 0
                    ? () => {
                        const ids = sections.map((s) => s.id);
                        [ids[sectionIdx - 1], ids[sectionIdx]] = [
                          ids[sectionIdx],
                          ids[sectionIdx - 1],
                        ];
                        handleReorderSections(ids);
                      }
                    : undefined
                }
                onMoveDown={
                  sectionIdx < sections.length - 1
                    ? () => {
                        const ids = sections.map((s) => s.id);
                        [ids[sectionIdx], ids[sectionIdx + 1]] = [
                          ids[sectionIdx + 1],
                          ids[sectionIdx],
                        ];
                        handleReorderSections(ids);
                      }
                    : undefined
                }
                onUpdate={(patch) => handleUpdateSection(section.id, patch)}
                onDelete={() => handleDeleteSection(section.id)}
                onToggle={(enabled) => handleToggleSection(section.id, enabled)}
                onSortModeChange={(mode) =>
                  handleSortModeChange(section.id, mode)
                }
                onAddEntry={() => handleAddEntry(section.id)}
                onUpdateEntry={(entryId, patch) =>
                  handleUpdateEntry(entryId, section.id, patch)
                }
                onDeleteEntry={(entryId) =>
                  handleDeleteEntry(entryId, section.id)
                }
                onToggleEntry={(entryId, enabled) =>
                  handleToggleEntry(entryId, section.id, enabled)
                }
                onSaveTranslation={(entryId, lang, fields) =>
                  handleSaveTranslation(entryId, section.id, lang, fields)
                }
                onDeleteTranslation={(entryId, lang) =>
                  handleDeleteTranslation(entryId, section.id, lang)
                }
              />
            ))}
          </div>

          <button
            onClick={handleAddSection}
            className="w-full rounded-lg border-2 border-dashed border-gray-300 py-3 text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors mb-8"
          >
            + Add Section
          </button>

          {/* Design panel */}
          <DesignPanel
            design={designForm}
            dirty={designDirty}
            saving={designSaving}
            saved={designSaved}
            onChange={handleDesignChange}
            onSave={handleSaveDesign}
          />
        </>
      )}
    </div>
  );
}

// ─── Section Card ───────────────────────────────────────────────────────────

interface SectionCardProps {
  section: SectionWithEntries;
  activeLang: string;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
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
}

function SectionCard({
  section,
  activeLang,
  onMoveUp,
  onMoveDown,
  onUpdate,
  onDelete,
  onToggle,
  onSortModeChange,
  onAddEntry,
  onUpdateEntry,
  onDeleteEntry,
  onToggleEntry,
  onSaveTranslation,
  onDeleteTranslation,
}: SectionCardProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div
      className={`rounded-xl border bg-white overflow-hidden ${
        section.is_enabled ? "border-gray-200" : "border-gray-200 opacity-60"
      }`}
    >
      {/* Section header */}
      <div className="flex items-center gap-2 p-4">
        <div className="flex flex-col">
          <button
            onClick={onMoveUp}
            disabled={!onMoveUp}
            className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30"
          >
            ↑
          </button>
          <button
            onClick={onMoveDown}
            disabled={!onMoveDown}
            className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30"
          >
            ↓
          </button>
        </div>

        <input
          type="checkbox"
          checked={section.is_enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300"
        />

        <input
          type="text"
          value={section.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          onBlur={() => onUpdate({ title: section.title })}
          className="flex-1 font-medium text-gray-900 bg-transparent border-b border-transparent focus:border-indigo-500 focus:outline-none"
        />

        <select
          value={section.section_type}
          onChange={(e) =>
            onUpdate({ section_type: e.target.value as SectionType })
          }
          className="text-sm rounded-lg border border-gray-300 px-2 py-1 bg-white"
        >
          {SECTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          value={section.entry_sort_mode}
          onChange={(e) => onSortModeChange(e.target.value as EntrySortMode)}
          className="text-sm rounded-lg border border-gray-300 px-2 py-1 bg-white"
        >
          {SORT_MODES.map((m) => (
            <option key={m} value={m}>
              {m.replace("_", " ")}
            </option>
          ))}
        </select>

        <button
          onClick={() => setExpanded(!expanded)}
          className="text-gray-400 hover:text-gray-700 px-2"
        >
          {expanded ? "−" : "+"}
        </button>

        <button
          onClick={onDelete}
          className="text-red-400 hover:text-red-600 px-1"
        >
          del
        </button>
      </div>

      {/* Entries */}
      {expanded && (
        <div className="px-4 pb-4 space-y-2">
          {section.entries.map((entry) => {
            const translation = entry.translations.find(
              (t) => t.language === activeLang
            );

            return (
              <EntryRow
                key={entry.id}
                entry={entry}
                translation={translation}
                activeLang={activeLang}
                onUpdate={(patch) => onUpdateEntry(entry.id, patch)}
                onDelete={() => onDeleteEntry(entry.id)}
                onToggle={(enabled) => onToggleEntry(entry.id, enabled)}
                onSaveTranslation={(lang, fields) =>
                  onSaveTranslation(entry.id, lang, fields)
                }
                onDeleteTranslation={(lang) =>
                  onDeleteTranslation(entry.id, lang)
                }
              />
            );
          })}

          <button
            onClick={onAddEntry}
            className="w-full text-sm text-gray-500 hover:text-indigo-600 py-2 border border-dashed border-gray-200 rounded-lg hover:border-indigo-300 transition-colors"
          >
            + Add Entry
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Entry Row ──────────────────────────────────────────────────────────────

interface EntryRowProps {
  entry: SectionWithEntries["entries"][0];
  translation?: SectionWithEntries["entries"][0]["translations"][0];
  activeLang: string;
  onUpdate: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
  onSaveTranslation: (
    lang: string,
    fields: { title: string; organization: string; description: string }
  ) => void;
  onDeleteTranslation: (lang: string) => void;
}

function EntryRow({
  entry,
  translation,
  activeLang,
  onUpdate,
  onDelete,
  onToggle,
  onSaveTranslation,
  onDeleteTranslation,
}: EntryRowProps) {
  const [title, setTitle] = useState(translation?.title ?? "");
  const [organization, setOrganization] = useState(
    translation?.organization ?? ""
  );
  const [description, setDescription] = useState(
    translation?.description ?? ""
  );
  const [showLangEditor, setShowLangEditor] = useState(false);

  // Sync when language switches or translation changes
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
      className={`flex items-start gap-2 p-3 rounded-lg bg-gray-50 ${
        !entry.is_enabled ? "opacity-50" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={entry.is_enabled}
        onChange={(e) => onToggle(e.target.checked)}
        className="h-4 w-4 mt-1 rounded border-gray-300"
      />

      <div className="flex-1 space-y-1">
        <div className="flex gap-2">
          <input
            type="number"
            value={entry.year ?? ""}
            onChange={(e) => {
              const year = e.target.value
                ? parseInt(e.target.value)
                : null;
              onUpdate({ year });
            }}
            placeholder="Year"
            className="w-20 text-sm rounded border border-gray-300 px-2 py-1 bg-white"
          />
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleSaveLang}
            placeholder="Title"
            className="flex-1 text-sm rounded border border-gray-300 px-2 py-1 bg-white"
          />
          <input
            type="text"
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            onBlur={handleSaveLang}
            placeholder="Organization"
            className="flex-1 text-sm rounded border border-gray-300 px-2 py-1 bg-white"
          />
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={handleSaveLang}
          placeholder="Description"
          rows={2}
          className="w-full text-sm rounded border border-gray-300 px-2 py-1 bg-white"
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">
            Lang: {activeLang} ({entry.translations.length} translations)
          </span>
          <button
            onClick={() => setShowLangEditor(!showLangEditor)}
            className="text-xs text-indigo-500 hover:underline"
          >
            {showLangEditor ? "Hide" : "Manage translations"}
          </button>
        </div>
        {showLangEditor && (
          <div className="mt-2 space-y-1 p-2 bg-white rounded border border-gray-200">
            {LANGUAGES.map((lang) => {
              const t = entry.translations.find((tr) => tr.language === lang.code);
              return (
                <div key={lang.code} className="flex items-center gap-2 text-xs">
                  <span className="w-20 font-medium">{lang.label}</span>
                  <span className="text-gray-600 flex-1">
                    {t ? `${t.title ?? ""} ${t.organization ?? ""}`.trim() : "—"}
                  </span>
                  {t && (
                    <button
                      onClick={() => onDeleteTranslation(lang.code)}
                      className="text-red-400 hover:text-red-600"
                    >
                      remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <button
        onClick={onDelete}
        className="text-red-400 hover:text-red-600 text-sm px-1 mt-1"
      >
        del
      </button>
    </div>
  );
}

// ─── Design Panel ─────────────────────────────────────────────────────────────

interface DesignPanelProps {
  design: Partial<CVDesign>;
  dirty: boolean;
  saving: boolean;
  saved: boolean;
  onChange: (field: string, value: unknown) => void;
  onSave: () => void;
}

function DesignPanel({
  design,
  dirty,
  saving,
  saved,
  onChange,
  onSave,
}: DesignPanelProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
      >
        <span className="font-medium">Design Settings</span>
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
              Unsaved changes
            </span>
          )}
          {saved && (
            <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
              Saved!
            </span>
          )}
          <span className="text-gray-400">{expanded ? "−" : "+"}</span>
        </div>
      </button>

      {expanded && (
        <div className="p-4 space-y-4 border-t border-gray-200">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Template
              </label>
              <select
                value={design.template ?? "clean"}
                onChange={(e) => onChange("template", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white"
              >
                <option value="clean">Clean</option>
                <option value="modern">Modern</option>
                <option value="creative">Creative</option>
                <option value="minimalist">Minimalist</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Font Family
              </label>
              <select
                value={design.font_family ?? "inter"}
                onChange={(e) => onChange("font_family", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white"
              >
                <option value="inter">Inter</option>
                <option value="georgia">Georgia</option>
                <option value="helvetica">Helvetica</option>
                <option value="times">Times New Roman</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Primary Color
              </label>
              <input
                type="color"
                value={design.primary_color ?? "#1a1a1a"}
                onChange={(e) => onChange("primary_color", e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-300"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Accent Color
              </label>
              <input
                type="color"
                value={design.accent_color ?? "#4f46e5"}
                onChange={(e) => onChange("accent_color", e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-300"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Spacing
              </label>
              <select
                value={design.spacing ?? "normal"}
                onChange={(e) => onChange("spacing", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white"
              >
                <option value="compact">Compact</option>
                <option value="normal">Normal</option>
                <option value="relaxed">Relaxed</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Border Radius ({design.border_radius ?? 8}px)
              </label>
              <input
                type="range"
                min={0}
                max={24}
                value={design.border_radius ?? 8}
                onChange={(e) =>
                  onChange("border_radius", parseInt(e.target.value))
                }
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Page Margin ({design.page_margin ?? 48}px)
              </label>
              <input
                type="range"
                min={16}
                max={96}
                value={design.page_margin ?? 48}
                onChange={(e) =>
                  onChange("page_margin", parseInt(e.target.value))
                }
                className="w-full"
              />
            </div>
          </div>

          <button
            onClick={onSave}
            disabled={!dirty || saving}
            className="rounded-lg bg-indigo-600 px-6 py-2 text-white font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Saving..." : "Save Design"}
          </button>
        </div>
      )}
    </div>
  );
}