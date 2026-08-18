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
}: TranslationPanelProps) {
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditingState>({ title: "", organization: "", description: "" });

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
  };

  const saveTranslation = (entryId: string, sectionId: string) => {
    onSaveTranslation(entryId, sectionId, secondaryLang, {
      title: editState.title.trim(),
      organization: editState.organization.trim(),
      description: editState.description.replace(/\n{3,}/g, "\n\n").trim(),
    });
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
      <div className="bg-white rounded-xl border border-gray-200 p-4">
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
      {sections.map((section) => (
        <div key={section.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Section header — read-only */}
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <div className="text-sm font-semibold text-gray-700">{section.title}</div>
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

              return (
                <div key={entry.id} className="px-4 py-3">
                  {/* Primary language reference (read-only) */}
                  <div className="mb-2">
                    <div className="text-xs font-bold text-teal-600 mb-1">
                      {primaryLangInfo?.label ?? primaryLang} (primary)
                    </div>
                    <div className="text-sm text-gray-700">
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

                  {/* Secondary language translation */}
                  <div className="border-t border-gray-100 pt-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="text-xs font-bold text-teal-600">
                        {secondaryLangInfo?.label ?? secondaryLang}
                      </div>
                      <div className="flex items-center gap-2">
                        {secondaryTranslation && !isEditing && (
                          <button
                            onClick={() => onDeleteTranslation(entry.id, section.id, secondaryLang)}
                            className="text-xs text-red-400 hover:text-red-600"
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
                      </div>
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
                      <div className="text-sm text-gray-600">
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
                      <div className="text-xs text-gray-400 italic">Not translated yet</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

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