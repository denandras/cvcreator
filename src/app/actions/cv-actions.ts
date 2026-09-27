"use server";

import { createAuthClient } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/auth";
import type {
  CVSection,
  SectionWithEntries,
  CVEntry,
  CVTranslation,
  SectionInput,
  EntrySortMode,
} from "@/types/database";

// ─── Sections ───────────────────────────────────────────────────────────────

export async function getSections(cvId: string): Promise<SectionWithEntries[]> {
  await requireAuth();
  const supabase = await createAuthClient();

  // Bulk-fetch sections, entries, and translations in 3 queries
  // (avoids the N+1 pattern: 1 + N_sections + N_entries sequential requests).
  const { data: sections, error } = await supabase
    .from("cv_sections")
    .select("*")
    .eq("cv_id", cvId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Failed to fetch sections: ${error.message}`);

  const sectionIds = (sections as CVSection[]).map((s) => s.id);
  if (sectionIds.length === 0) return [];

  const { data: entries } = await supabase
    .from("cv_entries")
    .select("*")
    .in("section_id", sectionIds)
    .order("sort_order", { ascending: true });

  const entryIds = ((entries as CVEntry[]) ?? []).map((e) => e.id);
  const { data: translations } = entryIds.length
    ? await supabase.from("cv_translations").select("*").in("entry_id", entryIds)
    : { data: [] };

  const translationsByEntry = new Map<string, CVTranslation[]>();
  for (const t of (translations as CVTranslation[]) ?? []) {
    const list = translationsByEntry.get(t.entry_id) ?? [];
    list.push(t);
    translationsByEntry.set(t.entry_id, list);
  }
  const entriesBySection = new Map<string, CVEntry[]>();
  for (const e of (entries as CVEntry[]) ?? []) {
    const list = entriesBySection.get(e.section_id) ?? [];
    list.push(e);
    entriesBySection.set(e.section_id, list);
  }

  const result: SectionWithEntries[] = [];
  for (const section of sections as CVSection[]) {
    const entriesWithTranslations: SectionWithEntries["entries"] =
      (entriesBySection.get(section.id) ?? []).map((entry) => ({
        ...entry,
        translations: translationsByEntry.get(entry.id) ?? [],
      }));

    // Apply entry sort mode
    if (section.entry_sort_mode === "year_asc") {
      entriesWithTranslations.sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
    } else if (section.entry_sort_mode === "year_desc") {
      entriesWithTranslations.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    }
    // custom: keep sort_order as-is (already ordered)

    result.push({ ...section, entries: entriesWithTranslations });
  }

  return result;
}

export async function createSection(input: SectionInput): Promise<CVSection> {
  await requireAuth();
  const supabase = await createAuthClient();

  const { data, error } = await supabase
    .from("cv_sections")
    .insert({
      cv_id: input.cv_id,
      title: input.title,
      is_enabled: input.is_enabled ?? true,
      sort_order: input.sort_order ?? 0,
      entry_sort_mode: input.entry_sort_mode ?? "year_desc",
      layout_config: input.layout_config ?? {},
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create section: ${error.message}`);
  return data as CVSection;
}

export async function updateSection(
  id: string,
  patch: Partial<Omit<CVSection, "id" | "cv_id" | "created_at" | "updated_at">>
): Promise<CVSection> {
  await requireAuth();
  const supabase = await createAuthClient();

  const { data, error } = await supabase
    .from("cv_sections")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update section: ${error.message}`);
  return data as CVSection;
}

export async function deleteSection(id: string): Promise<void> {
  await requireAuth();
  const supabase = await createAuthClient();

  const { error } = await supabase.from("cv_sections").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete section: ${error.message}`);
}

export async function toggleSectionEnabled(
  id: string,
  is_enabled: boolean
): Promise<void> {
  await updateSection(id, { is_enabled });
}

export async function reorderSections(
  cvId: string,
  sectionIds: string[]
): Promise<void> {
  await requireAuth();
  const supabase = await createAuthClient();

  for (let i = 0; i < sectionIds.length; i++) {
    const { error } = await supabase
      .from("cv_sections")
      .update({ sort_order: i })
      .eq("id", sectionIds[i]);
    if (error) throw new Error(`Failed to reorder sections: ${error.message}`);
  }
}

export async function setEntrySortMode(
  sectionId: string,
  mode: EntrySortMode
): Promise<void> {
  await updateSection(sectionId, { entry_sort_mode: mode });
}

// ─── Entries ────────────────────────────────────────────────────────────────

export async function createEntry(
  sectionId: string,
  data: { year?: number | null; sort_order?: number; data?: Record<string, unknown> }
): Promise<CVEntry> {
  await requireAuth();
  const supabase = await createAuthClient();

  const { data: result, error } = await supabase
    .from("cv_entries")
    .insert({
      section_id: sectionId,
      year: data.year ?? null,
      is_enabled: true,
      sort_order: data.sort_order ?? 0,
      data: data.data ?? {},
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create entry: ${error.message}`);
  return result as CVEntry;
}

export async function updateEntry(
  id: string,
  patch: Partial<Omit<CVEntry, "id" | "section_id" | "created_at" | "updated_at">>
): Promise<CVEntry> {
  await requireAuth();
  const supabase = await createAuthClient();

  const { data, error } = await supabase
    .from("cv_entries")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update entry: ${error.message}`);
  return data as CVEntry;
}

export async function deleteEntry(id: string): Promise<void> {
  await requireAuth();
  const supabase = await createAuthClient();

  const { error } = await supabase.from("cv_entries").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete entry: ${error.message}`);
}

export async function toggleEntryEnabled(
  id: string,
  is_enabled: boolean
): Promise<void> {
  await updateEntry(id, { is_enabled });
}

export async function reorderEntries(
  sectionId: string,
  entryIds: string[]
): Promise<void> {
  await requireAuth();
  const supabase = await createAuthClient();

  for (let i = 0; i < entryIds.length; i++) {
    const { error } = await supabase
      .from("cv_entries")
      .update({ sort_order: i })
      .eq("id", entryIds[i]);
    if (error) throw new Error(`Failed to reorder entries: ${error.message}`);
  }
}

// ─── Translations ───────────────────────────────────────────────────────────

export async function upsertTranslation(
  input: {
    entry_id: string;
    language: string;
    title?: string | null;
    organization?: string | null;
    description?: string | null;
    data?: Record<string, unknown>;
  }
): Promise<CVTranslation> {
  await requireAuth();
  const supabase = await createAuthClient();

  const { data, error } = await supabase
    .from("cv_translations")
    .upsert(
      {
        entry_id: input.entry_id,
        language: input.language,
        title: input.title ?? null,
        organization: input.organization ?? null,
        description: input.description ?? null,
        data: input.data ?? {},
      },
      { onConflict: "entry_id,language" }
    )
    .select()
    .single();

  if (error) throw new Error(`Failed to upsert translation: ${error.message}`);
  return data as CVTranslation;
}

export async function deleteTranslation(
  entryId: string,
  language: string
): Promise<void> {
  await requireAuth();
  const supabase = await createAuthClient();

  const { error } = await supabase
    .from("cv_translations")
    .delete()
    .eq("entry_id", entryId)
    .eq("language", language);
  if (error) throw new Error(`Failed to delete translation: ${error.message}`);
}

export async function getTranslations(
  entryId: string
): Promise<CVTranslation[]> {
  await requireAuth();
  const supabase = await createAuthClient();

  const { data, error } = await supabase
    .from("cv_translations")
    .select("*")
    .eq("entry_id", entryId);

  if (error) throw new Error(`Failed to fetch translations: ${error.message}`);
  return (data as CVTranslation[]) || [];
}

// ─── Section duplication ────────────────────────────────────────────────────

/**
 * Duplicate a section with all entries and translations. The copy is
 * inserted right after the original (sort_order = original + 1, pushing
 * later sections down) and starts enabled with the same layout config.
 */
export async function duplicateSection(sectionId: string): Promise<CVSection> {
  await requireAuth();
  const supabase = await createAuthClient();

  // 1. Load the source section
  const { data: source, error: srcErr } = await supabase
    .from("cv_sections")
    .select("*")
    .eq("id", sectionId)
    .single();
  if (srcErr || !source) throw new Error(`Failed to load section: ${srcErr?.message}`);
  const src = source as CVSection;

  // 2. Shift sort_order of all sections after the original to make room
  const { data: later, error: laterErr } = await supabase
    .from("cv_sections")
    .select("id, sort_order")
    .eq("cv_id", src.cv_id)
    .gt("sort_order", src.sort_order);
  if (laterErr) throw new Error(`Failed to load sections: ${laterErr.message}`);
  for (const s of (later as Array<{ id: string; sort_order: number }>) || []) {
    const { error } = await supabase
      .from("cv_sections")
      .update({ sort_order: s.sort_order + 1 })
      .eq("id", s.id);
    if (error) throw new Error(`Failed to shift sections: ${error.message}`);
  }

  // 3. Insert the copy
  const { data: created, error: createErr } = await supabase
    .from("cv_sections")
    .insert({
      cv_id: src.cv_id,
      title: src.title,
      is_enabled: src.is_enabled,
      sort_order: src.sort_order + 1,
      entry_sort_mode: src.entry_sort_mode,
      layout_config: src.layout_config ?? {},
    })
    .select()
    .single();
  if (createErr) throw new Error(`Failed to duplicate section: ${createErr.message}`);
  const copy = created as CVSection;

  // 4. Copy entries + translations
  const { data: entries, error: entriesErr } = await supabase
    .from("cv_entries")
    .select("*")
    .eq("section_id", sectionId)
    .order("sort_order", { ascending: true });
  if (entriesErr) throw new Error(`Failed to load entries: ${entriesErr.message}`);

  for (const entry of (entries as CVEntry[]) || []) {
    const { data: newEntry, error: entryErr } = await supabase
      .from("cv_entries")
      .insert({
        section_id: copy.id,
        year: entry.year,
        is_enabled: entry.is_enabled,
        sort_order: entry.sort_order,
        data: entry.data ?? {},
      })
      .select()
      .single();
    if (entryErr) throw new Error(`Failed to duplicate entry: ${entryErr.message}`);

    const { data: translations, error: trErr } = await supabase
      .from("cv_translations")
      .select("*")
      .eq("entry_id", entry.id);
    if (trErr) throw new Error(`Failed to load translations: ${trErr.message}`);

    for (const tr of (translationsOf(trErr, translations) as CVTranslation[]) || []) {
      const { error: insErr } = await supabase.from("cv_translations").insert({
        entry_id: (newEntry as CVEntry).id,
        language: tr.language,
        title: tr.title,
        organization: tr.organization,
        description: tr.description,
        data: tr.data ?? {},
      });
      if (insErr) throw new Error(`Failed to duplicate translation: ${insErr.message}`);
    }
  }

  return copy;
}

// Small local helper so the loop above stays readable
function translationsOf(
  _err: unknown,
  translations: unknown
): CVTranslation[] | null {
  void _err;
  return translations as CVTranslation[] | null;
}