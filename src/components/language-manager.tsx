"use client";

import { useState } from "react";
import type { CustomLanguage } from "@/lib/languages";
import { addLanguage, removeLanguage, savePrimaryLanguage } from "@/lib/languages";

interface LanguageManagerProps {
  languages: CustomLanguage[];
  onChange: (languages: CustomLanguage[]) => void;
  activeLang: string;
  onActiveLangChange: (code: string) => void;
  primaryLang: string;
  onPrimaryLangChange: (code: string) => void;
}

export function LanguageManager({
  languages,
  onChange,
  activeLang,
  onActiveLangChange,
  primaryLang,
  onPrimaryLangChange,
}: LanguageManagerProps) {
  const [newLangName, setNewLangName] = useState("");
  const [newLangCode, setNewLangCode] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const handleAdd = () => {
    const trimmedName = newLangName.trim();
    if (!trimmedName) return;
    const updated = addLanguage(languages, trimmedName, newLangCode.trim() || undefined);
    onChange(updated);
    // Auto-select the newly added language
    const newCode = updated[updated.length - 1]?.code;
    if (newCode) onActiveLangChange(newCode);
    setNewLangName("");
    setNewLangCode("");
    setShowAddForm(false);
  };

  const handleRemove = (code: string) => {
    // Don't allow removing the primary language
    if (code === primaryLang) return;
    const updated = removeLanguage(languages, code);
    onChange(updated);
    // If removing the active language, switch to primary
    if (activeLang === code) {
      onActiveLangChange(primaryLang);
    }
  };

  const handleSetPrimary = (code: string) => {
    onPrimaryLangChange(code);
    savePrimaryLanguage(code);
    // Switch to the new primary language
    onActiveLangChange(code);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
    if (e.key === "Escape") {
      setShowAddForm(false);
      setNewLangName("");
      setNewLangCode("");
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Languages
        </div>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="text-xs font-medium text-teal-600 hover:text-teal-700 flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-teal-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
            </svg>
            Add Language
          </button>
        )}
      </div>

      {/* Primary language section */}
      {languages.length > 0 && (
        <div className="mb-2 pb-2 border-b border-gray-100">
          <div className="text-xs text-gray-400 mb-1.5 font-medium">Primary (main CV language)</div>
          {languages.filter((l) => l.code === primaryLang).map((lang) => (
            <div
              key={lang.code}
              className={`flex items-center gap-2 px-2.5 py-2 rounded-lg transition-colors ${
                activeLang === lang.code
                  ? "bg-teal-50 ring-1 ring-teal-200"
                  : "bg-gray-50 hover:bg-gray-100"
              }`}
            >
              <button
                onClick={() => onActiveLangChange(lang.code)}
                className="flex items-center gap-2 flex-1 text-left"
              >
                <span className="text-xs font-bold text-teal-600 w-8">{lang.label}</span>
                <span className="text-sm text-gray-700">{lang.full}</span>
              </button>
              <span className="text-xs font-medium text-teal-600 bg-teal-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                Primary
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Secondary languages section */}
      {languages.filter((l) => l.code !== primaryLang).length > 0 && (
        <div>
          <div className="text-xs text-gray-400 mb-1.5 font-medium">Secondary (translations)</div>
          <div className="space-y-1.5">
            {languages.filter((l) => l.code !== primaryLang).map((lang) => (
              <div
                key={lang.code}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors group ${
                  activeLang === lang.code
                    ? "bg-teal-50 ring-1 ring-teal-200"
                    : "bg-gray-50 hover:bg-gray-100"
                }`}
              >
                <button
                  onClick={() => onActiveLangChange(lang.code)}
                  className="flex items-center gap-2 flex-1 text-left"
                >
                  <span className="text-xs font-bold text-teal-600 w-8">{lang.label}</span>
                  <span className="text-sm text-gray-700">{lang.full}</span>
                </button>
                <button
                  onClick={() => handleSetPrimary(lang.code)}
                  className="text-gray-300 hover:text-teal-500 transition-colors p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-lg hover:bg-teal-50 opacity-0 group-hover:opacity-100"
                  title={`Set ${lang.full} as primary`}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleRemove(lang.code)}
                  className="text-gray-300 hover:text-red-500 transition-colors p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-lg hover:bg-red-50"
                  title={`Remove ${lang.full}`}
                >
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {languages.length === 0 && !showAddForm && (
        <p className="text-xs text-gray-400 py-2 italic">
          No languages yet. Add one to start translating.
        </p>
      )}

      {/* Add language form */}
      {showAddForm && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
          <input
            type="text"
            value={newLangName}
            onChange={(e) => setNewLangName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Language name (e.g. Spanish, Magyar)"
            className="w-full text-sm rounded-lg border border-gray-300 px-3 py-2 bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
            autoFocus
          />
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={newLangCode}
              onChange={(e) => setNewLangCode(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Code (optional, e.g. es)"
              className="w-full sm:w-32 text-sm rounded-lg border border-gray-300 px-3 py-2 bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
            />
            <div className="flex gap-1.5 flex-1 justify-end">
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewLangName("");
                  setNewLangCode("");
                }}
                className="text-xs font-medium text-gray-500 hover:text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={!newLangName.trim()}
                className="text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors"
              >
                Add
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400 italic">
            New languages are added as secondary (translation) languages.
          </p>
        </div>
      )}
    </div>
  );
}