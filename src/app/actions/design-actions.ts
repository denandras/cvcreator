"use server";

import { createAuthClient } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/auth";
import type { CVDesign, DesignInput, CV, CVSection } from "@/types/database";

// ─── CVs ────────────────────────────────────────────────────────────────────

export async function getUserCVs(): Promise<CV[]> {
  await requireAuth();
  const supabase = await createAuthClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("cvs")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch CVs: ${error.message}`);
  return (data as CV[]) || [];
}

export async function getCV(cvId: string): Promise<CV | null> {
  await requireAuth();
  const supabase = await createAuthClient();

  const { data, error } = await supabase
    .from("cvs")
    .select("*")
    .eq("id", cvId)
    .single();

  if (error) return null;
  return data as CV;
}

// ─── Designs ────────────────────────────────────────────────────────────────

export async function getDesign(cvId: string): Promise<CVDesign | null> {
  await requireAuth();
  const supabase = await createAuthClient();

  const { data, error } = await supabase
    .from("cv_designs")
    .select("*")
    .eq("cv_id", cvId)
    .single();

  if (error) return null;
  return data as CVDesign;
}

/**
 * Save design — explicit save button only.
 * Does NOT auto-save. The UI must call this when the user clicks "Save Design".
 */
export async function saveDesign(
  cvId: string,
  input: Partial<DesignInput>
): Promise<CVDesign> {
  await requireAuth();
  const supabase = await createAuthClient();

  // Check if design exists
  const { data: existing } = await supabase
    .from("cv_designs")
    .select("id")
    .eq("cv_id", cvId)
    .single();

  if (existing) {
    const { data, error } = await supabase
      .from("cv_designs")
      .update({
        template: input.template,
        font_family: input.font_family,
        primary_color: input.primary_color,
        accent_color: input.accent_color,
        spacing: input.spacing,
        border_radius: input.border_radius,
        page_margin: input.page_margin,
        custom_config: input.custom_config,
      })
      .eq("cv_id", cvId)
      .select()
      .single();

    if (error) throw new Error(`Failed to save design: ${error.message}`);
    return data as CVDesign;
  } else {
    const { data, error } = await supabase
      .from("cv_designs")
      .insert({
        cv_id: cvId,
        template: input.template ?? "clean",
        font_family: input.font_family ?? "inter",
        primary_color: input.primary_color ?? "#1a1a1a",
        accent_color: input.accent_color ?? "#4f46e5",
        spacing: input.spacing ?? "normal",
        border_radius: input.border_radius ?? 8,
        page_margin: input.page_margin ?? 48,
        custom_config: input.custom_config ?? {},
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create design: ${error.message}`);
    return data as CVDesign;
  }
}

// ─── Full CV data load ───────────────────────────────────────────────────────

export async function getFullCVData(cvId: string) {
  await requireAuth();
  const supabase = await createAuthClient();

  // Get CV
  const { data: cv } = await supabase
    .from("cvs")
    .select("*")
    .eq("id", cvId)
    .single();
  if (!cv) throw new Error("CV not found");

  // Get design
  const { data: design } = await supabase
    .from("cv_designs")
    .select("*")
    .eq("cv_id", cvId)
    .single();

  // Get sections
  const { data: sections } = await supabase
    .from("cv_sections")
    .select("*")
    .eq("cv_id", cvId)
    .order("sort_order", { ascending: true });

  // Get entries + translations for each section
  const sectionsWithData = await Promise.all(
    ((sections as CVSection[]) || []).map(async (section) => {
      const { data: entries } = await supabase
        .from("cv_entries")
        .select("*")
        .eq("section_id", section.id)
        .order("sort_order", { ascending: true });

      const entriesWithTranslations = await Promise.all(
        ((entries as any[]) || []).map(async (entry) => {
          const { data: translations } = await supabase
            .from("cv_translations")
            .select("*")
            .eq("entry_id", entry.id);

          return { ...entry, translations: translations || [] };
        })
      );

      // Apply sort mode
      let sortedEntries = entriesWithTranslations;
      if (section.entry_sort_mode === "year_asc") {
        sortedEntries = [...entriesWithTranslations].sort(
          (a, b) => (a.year ?? 0) - (b.year ?? 0)
        );
      } else if (section.entry_sort_mode === "year_desc") {
        sortedEntries = [...entriesWithTranslations].sort(
          (a, b) => (b.year ?? 0) - (a.year ?? 0)
        );
      }

      return { ...section, entries: sortedEntries };
    })
  );

  return {
    cv: cv as CV,
    design: (design as CVDesign) || null,
    sections: sectionsWithData,
  };
}