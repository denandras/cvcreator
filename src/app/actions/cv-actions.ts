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

  const { data: sections, error } = await supabase
    .from("cv_sections")
    .select("*")
    .eq("cv_id", cvId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Failed to fetch sections: ${error.message}`);

  const result: SectionWithEntries[] = [];
  for (const section of sections as CVSection[]) {
    const { data: entries } = await supabase
      .from("cv_entries")
      .select("*")
      .eq("section_id", section.id)
      .order("sort_order", { ascending: true });

    const entriesWithTranslations: SectionWithEntries["entries"] = [];
    for (const entry of (entries as CVEntry[]) || []) {
      const { data: translations } = await supabase
        .from("cv_translations")
        .select("*")
        .eq("entry_id", entry.id);

      entriesWithTranslations.push({
        ...entry,
        translations: (translations as CVTranslation[]) || [],
      });
    }

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