/**
 * Custom language management — stored in localStorage.
 * No preset languages. Users add/remove their own.
 * Shared by both the authenticated editor and demo editor.
 */

export interface CustomLanguage {
  code: string;   // e.g. "en", "hu", "de" — used as the translation key
  label: string;  // short display label, e.g. "EN", "Magyar"
  full: string;   // full name, e.g. "English", "Hungarian"
}

const STORAGE_KEY = "cvcreator:custom-languages";
const PRIMARY_KEY = "cvcreator:primary-language";

/** Default seed — Hungarian first, then English. */
export const DEFAULT_LANGUAGES: CustomLanguage[] = [
  { code: "hu", label: "HU", full: "Hungarian" },
  { code: "en", label: "EN", full: "English" },
];

/** Demo seed — includes all languages present in the demo sample data. */
export const DEMO_LANGUAGES: CustomLanguage[] = [
  { code: "hu", label: "HU", full: "Hungarian" },
  { code: "en", label: "EN", full: "English" },
  { code: "de", label: "DE", full: "German" },
  { code: "fr", label: "FR", full: "French" },
];

// ─── Storage helpers ────────────────────────────────────────────────────────

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/** Load custom languages from localStorage. Returns [] if none stored. */
export function loadLanguages(): CustomLanguage[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (l) => l && typeof l.code === "string" && typeof l.label === "string" && typeof l.full === "string"
    );
  } catch {
    return [];
  }
}

/** Persist languages to localStorage. */
export function saveLanguages(languages: CustomLanguage[]): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(languages));
  } catch {
    // storage full or blocked — non-fatal
  }
}

/** Add a new language. Returns the updated list. Validates uniqueness. */
export function addLanguage(
  languages: CustomLanguage[],
  name: string,
  code?: string
): CustomLanguage[] {
  const trimmedName = name.trim();
  if (!trimmedName) return languages;

  // Auto-generate code from name if not provided
  let langCode = (code ?? "").trim().toLowerCase();
  if (!langCode) {
    // Use first 2 chars of the name lowercased, fallback to "xx"
    langCode = trimmedName.slice(0, 2).toLowerCase();
  }

  // Ensure code is unique — append a number if needed
  const existingCodes = new Set(languages.map((l) => l.code));
  if (existingCodes.has(langCode)) {
    let suffix = 2;
    while (existingCodes.has(`${langCode}${suffix}`)) suffix++;
    langCode = `${langCode}${suffix}`;
  }

  // Generate a short label from code (uppercase, max 4 chars)
  const label = langCode.slice(0, 4).toUpperCase();

  const newLang: CustomLanguage = { code: langCode, label, full: trimmedName };
  const updated = [...languages, newLang];
  saveLanguages(updated);
  return updated;
}

/** Remove a language by code. Returns the updated list. */
export function removeLanguage(languages: CustomLanguage[], code: string): CustomLanguage[] {
  const updated = languages.filter((l) => l.code !== code);
  saveLanguages(updated);
  return updated;
}

/** Ensure languages exist — if empty, seed with defaults. Returns the list. */
export function ensureLanguages(): CustomLanguage[] {
  const existing = loadLanguages();
  if (existing.length > 0) return existing;
  saveLanguages(DEFAULT_LANGUAGES);
  return DEFAULT_LANGUAGES;
}

// ─── Primary language ────────────────────────────────────────────────────────

/** Load the primary language code from localStorage. Returns null if unset. */
export function loadPrimaryLanguage(): string | null {
  if (!isBrowser()) return null;
  try {
    return localStorage.getItem(PRIMARY_KEY);
  } catch {
    return null;
  }
}

/** Persist the primary language code to localStorage. */
export function savePrimaryLanguage(code: string): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(PRIMARY_KEY, code);
  } catch {
    // non-fatal
  }
}

/**
 * Ensure a primary language is set. If unset, default to the first language
 * in the list. Returns the primary language code.
 */
export function ensurePrimaryLanguage(languages: CustomLanguage[]): string {
  const stored = loadPrimaryLanguage();
  if (stored && languages.find((l) => l.code === stored)) {
    return stored;
  }
  // Default to first language
  const primary = languages[0]?.code ?? "hu";
  savePrimaryLanguage(primary);
  return primary;
}