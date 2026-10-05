"use client";

import { useState, useEffect } from "react";
import type { SectionWithEntries } from "@/types/database";
import type { CustomLanguage } from "@/lib/languages";

interface TranslationPanelProps {
  sections: SectionWithEntries[];
  primaryLang: string;
  secondaryLang: string;
  languages: CustomLanguage[];
  onSaveTranslation: (
    entryId: string,
    sectionId: string,
    lang: string,
    fields: { title: string; organization: string; description: string }
  ) => void;
  onDeleteTranslation: (entryId: string, sectionId: string, lang: string) => void;
  /** Persist a translated section title (layout_config.sectionTitleTranslations). */
  onSaveSectionTitle: (sectionId: string, lang: string, title: string) => void;
}

interface EditingState {
  title: string;
  organization: string;
  description: string;
}

export function TranslationPanel({
  sections,
  primaryLang,
  secondaryLang,
  languages,
  onSaveTranslation,
  onDeleteTranslation,
  onSaveSectionTitle,
}: TranslationPanelProps) {
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditingState>({ title: "", organization: "", description: "" });
  // Section-title editing: null = not editing; "primary" = editing original;
  // otherwise the secondary lang code being translated.
  const [editingTitleSectionId, setEditingTitleSectionId] = useState<string | null>(null);
  const [sectionTitleDraft, setSectionTitleDraft] = useState("");

  const primaryLangInfo = languages.find((l) => l.code === primaryLang);
  const secondaryLangInfo = languages.find((l) => l.code === secondaryLang);

  const startEditing = (
    entryId: string,
    translation: SectionWithEntries["entries"][0]["translations"][0] | undefined
  ) => {
    setEditingEntryId(entryId);
    setEditState({
      title: translation?.title ?? "",
      organization: translation?.organization ?? "",
      description: translation?.description ?? "",
    });
  };

  const cancelEditing = () => {
    setEditingEntryId(null);
    setEditState({ title: "", organization: "", description: "" });
    setEditingTitleSectionId(null);
    setSectionTitleDraft("");
  };

  const saveTranslation = (entryId: string, sectionId: string) => {
    onSaveTranslation(entryId, sectionId, secondaryLang, {
      title: editState.title.trim(),
      organization: editState.organization.trim(),
      description: editState.description.replace(/\n{3,}/g, "\n\n").trim(),
    });
    cancelEditing();
  };

  const startEditingSectionTitle = (
    sectionId: string,
    current: string
  ) => {
    setEditingTitleSectionId(sectionId);
    setSectionTitleDraft(current);
  };

  const saveSectionTitle = (sectionId: string) => {
    const t = sectionTitleDraft.trim();
    if (!t) {
      // Empty draft = no change (the original title must stay non-empty).
      cancelEditing();
      return;
    }
    onSaveSectionTitle(sectionId, secondaryLang, t);
    cancelEditing();
  };

  // Auto-switch editing entry when language changes
  useEffect(() => {
    cancelEditing();
  }, [secondaryLang]);

  // Count translated entries
  const totalEntries = sections.reduce((sum, s) => sum + s.entries.length, 0);
  const translatedEntries = sections.reduce(
    (sum, s) =>
      sum +
      s.entries.filter((e) => {
        const t = e.translations.find((tr) => tr.language === secondaryLang);
        return t && (t.title || t.organization || t.description);
      }).length,
    0
  );

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-gray-200 bg-gray-100 p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-sm font-semibold text-gray-800">
              Translating to {secondaryLangInfo?.full ?? secondaryLang}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              Reference: {primaryLangInfo?.full ?? primaryLang} (primary)
            </div>
          </div>
          <div className="text-xs text-gray-400">
            {translatedEntries}/{totalEntries} translated
          </div>
        </div>
        {/* Progress bar */}
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-teal-500 rounded-full transition-all"
            style={{ width: `${totalEntries > 0 ? (translatedEntries / totalEntries) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Sections with entries */}
      {sections.map((section) => {
        const sectionTitleTranslation = (
          section as SectionWithEntries & {
            title_translations?: Record<string, string>;
          }
        ).title_translations?.[secondaryLang];
        const sectionTitleUntranslated =
          secondaryLang !== "primary" && !sectionTitleTranslation;
        return (
        <div key={section.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Section title — dual-color: grey = translation, white = original */}
          <div className="px-4 py-3 space-y-1.5">
            {/* Grey block: translation (or placeholder) for the section title */}
            <div className="px-2.5 py-1.5 rounded-md bg-gray-200/70">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  Section title · {secondaryLangInfo?.label ?? secondaryLang}
                </span>
                {editingTitleSectionId === section.id && secondaryLang !== "primary" ? (
                  <span className="flex items-center gap-2">
                    <button
                      onClick={cancelEditing}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => saveSectionTitle(section.id)}
                      className="text-xs text-white bg-teal-600 hover:bg-teal-700 px-2 py-0.5 rounded font-medium"
                    >
                      Save
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() =>
                      startEditingSectionTitle(section.id, sectionTitleTranslation ?? "")
                    }
                    className="text-xs text-teal-600 hover:text-teal-700 font-medium flex-shrink-0"
                  >
                    {sectionTitleTranslation ? "Edit" : "Translate"}
                  </button>
                )}
              </div>
              {editingTitleSectionId === section.id && secondaryLang !== "primary" ? (
                <input
                  type="text"
                  value={sectionTitleDraft}
                  onChange={(e) => setSectionTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveSectionTitle(section.id);
                    if (e.key === "Escape") cancelEditing();
                  }}
                  onBlur={() => saveSectionTitle(section.id)}
                  placeholder={section.title}
                  className="w-full text-sm font-semibold rounded-lg border border-gray-300 px-2 py-1.5 bg-white focus:border-teal-500 focus:outline-none"
                  autoFocus
                />
              ) : sectionTitleTranslation ? (
                <div className="text-sm font-semibold text-gray-700">
                  {sectionTitleTranslation}
                </div>
              ) : (
                <div className="text-xs italic text-gray-400">
                  Not translated — the original title will be used in the PDF
                </div>
              )}
            </div>
            {/* White block: original title (primary language) */}
            <div
              className={`px-2.5 py-1.5 rounded-md bg-white border border-gray-100 ${
                sectionTitleUntranslated ? "border-l-4 border-l-amber-400" : ""
              }`}
            >
              <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-0.5">
                Section title · {primaryLangInfo?.label ?? primaryLang} (original)
              </div>
              <div className="text-sm font-semibold text-gray-900">{section.title}</div>
            </div>
          </div>
          {/* Entries */}
          <div className="divide-y divide-gray-100">
            {section.entries.length === 0 && (
              <div className="px-4 py-3 text-xs text-gray-400 italic">No entries in this section.</div>
            )}
            {section.entries.map((entry) => {
              const primaryTranslation = entry.translations.find((t) => t.language === primaryLang);
              const secondaryTranslation = entry.translations.find((t) => t.language === secondaryLang);
              const isEditing = editingEntryId === entry.id;
              // Untranslated = no secondary translation with any content.
              // The amber flag is carried by the WHITE (original) line so the
              // untranslated item is obvious at a glance — the grey line
              // beneath it is the (empty) translation slot.
              const isUntranslated =
                !secondaryTranslation ||
                !(secondaryTranslation.title || secondaryTranslation.organization || secondaryTranslation.description);

              return (
                <div key={entry.id} className="px-4 py-3 space-y-1.5">
                  {/* WHITE line — original (primary language, read-only).
                      Carries the amber untranslated edge + badge. */}
                  <div
                    className={`px-2.5 py-1.5 rounded-md bg-white border border-gray-100 ${
                      isUntranslated ? "border-l-4 border-l-amber-400" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                        {primaryLangInfo?.label ?? primaryLang} (original)
                      </span>
                      {isUntranslated && (
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-100 border border-amber-300 rounded px-1.5 py-0.5"
                          title="This entry has no translation in the active language yet — the PDF will show the original text instead"
                        >
                          Untranslated
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-900">
                      {primaryTranslation?.title && (
                        <span className="font-medium">{primaryTranslation.title}</span>
                      )}
                      {primaryTranslation?.title && primaryTranslation?.organization && (
                        <span className="text-gray-400"> — </span>
                      )}
                      {primaryTranslation?.organization && (
                        <span>{primaryTranslation.organization}</span>
                      )}
                      {!primaryTranslation?.title && !primaryTranslation?.organization && (
                        <span className="text-gray-400 italic text-xs">No primary text yet</span>
                      )}
                    </div>
                    {primaryTranslation?.description && (
                      <div className="text-xs text-gray-500 mt-1 whitespace-pre-wrap line-clamp-3">
                        {primaryTranslation.description}
                      </div>
                    )}
                    <div className="text-xs text-gray-400 mt-0.5">
                      Year: {entry.year ?? "—"}
                    </div>
                  </div>

                  {/* GREY line — translation (target language) */}
                  <div className="px-2.5 py-1.5 rounded-md bg-gray-200/70">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                        {secondaryLangInfo?.label ?? secondaryLang}
                      </span>
                      <span className="flex items-center gap-2">
                        {secondaryTranslation && !isEditing && (
                          <button
                            onClick={() => onDeleteTranslation(entry.id, section.id, secondaryLang)}
                            className="text-xs text-gray-400 hover:text-teal-600"
                            title="Remove translation"
                          >
                            remove
                          </button>
                        )}
                        {!isEditing && (
                          <button
                            onClick={() => startEditing(entry.id, secondaryTranslation)}
                            className="text-xs text-teal-600 hover:text-teal-700 font-medium"
                          >
                            {secondaryTranslation ? "Edit" : "Translate"}
                          </button>
                        )}
                      </span>
                    </div>

                    {isEditing ? (
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          value={editState.title}
                          onChange={(e) => setEditState((s) => ({ ...s, title: e.target.value }))}
                          placeholder="Title"
                          className="w-full text-sm rounded-lg border border-gray-300 px-3 py-2 bg-white focus:border-teal-500 focus:outline-none"
                          autoFocus
                        />
                        <input
                          type="text"
                          value={editState.organization}
                          onChange={(e) => setEditState((s) => ({ ...s, organization: e.target.value }))}
                          placeholder="Organization"
                          className="w-full text-sm rounded-lg border border-gray-300 px-3 py-2 bg-white focus:border-teal-500 focus:outline-none"
                        />
                        <textarea
                          value={editState.description}
                          onChange={(e) => setEditState((s) => ({ ...s, description: e.target.value }))}
                          placeholder="Description"
                          rows={3}
                          className="w-full text-sm rounded-lg border border-gray-300 px-3 py-2 bg-white resize-y focus:border-teal-500 focus:outline-none"
                        />
                        <div className="flex gap-1.5 justify-end">
                          <button
                            onClick={cancelEditing}
                            className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => saveTranslation(entry.id, section.id)}
                            className="text-xs text-white bg-teal-600 hover:bg-teal-700 px-4 py-1.5 rounded-lg font-medium"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : secondaryTranslation ? (
                      <div className="text-sm text-gray-700">
                        {secondaryTranslation.title && (
                          <span className="font-medium">{secondaryTranslation.title}</span>
                        )}
                        {secondaryTranslation.title && secondaryTranslation.organization && (
                          <span className="text-gray-400"> — </span>
                        )}
                        {secondaryTranslation.organization && (
                          <span>{secondaryTranslation.organization}</span>
                        )}
                        {secondaryTranslation.description && (
                          <div className="text-xs text-gray-500 mt-1 whitespace-pre-wrap">
                            {secondaryTranslation.description}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500 italic">
                        Not translated yet — will render in {primaryLangInfo?.label ?? primaryLang} in the PDF
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        );
      })}

      {totalEntries === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-400">
            No entries to translate. Add entries in the primary language first.
          </p>
        </div>
      )}
    </div>
  );
}