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
        accent_color: input.accent_color ?? "#14b8a6",
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

// ─── Profile info (name/title) ──────────────────────────────────────────────
// Stored in cv_designs.custom_config jsonb:
//   profile_name / profile_title        — primary language values
//   profile_translations: { [lang]: { name, title } } — per-language overrides
// (no dedicated columns; survives reload, RLS-protected like the rest of the design row)

export interface ProfileTranslations {
  [lang: string]: { name: string; title: string };
}

function readProfileConfig(cfg: Record<string, unknown>) {
  const t = (cfg.profile_translations ?? {}) as ProfileTranslations;
  const translations: ProfileTranslations = {};
  for (const [lang, v] of Object.entries(t)) {
    if (v && typeof v === "object") {
      const obj = v as { name?: unknown; title?: unknown };
      translations[lang] = {
        name: typeof obj.name === "string" ? obj.name : "",
        title: typeof obj.title === "string" ? obj.title : "",
      };
    }
  }
  return translations;
}

export async function getProfileInfo(
  cvId: string
): Promise<{
  profileName: string;
  profileTitle: string;
  profileTranslations: ProfileTranslations;
}> {
  await requireAuth();
  const supabase = await createAuthClient();

  const { data } = await supabase
    .from("cv_designs")
    .select("custom_config")
    .eq("cv_id", cvId)
    .single();

  const cfg = ((data?.custom_config as Record<string, unknown>) ?? {}) as Record<
    string,
    unknown
  >;
  return {
    profileName: typeof cfg.profile_name === "string" ? cfg.profile_name : "",
    profileTitle: typeof cfg.profile_title === "string" ? cfg.profile_title : "",
    profileTranslations: readProfileConfig(cfg),
  };
}

export async function saveProfileInfo(
  cvId: string,
  profileName: string,
  profileTitle: string,
  profileTranslations?: ProfileTranslations
): Promise<void> {
  await requireAuth();
  const supabase = await createAuthClient();

  // Read-modify-write custom_config so we don't clobber other design keys
  const { data: existing } = await supabase
    .from("cv_designs")
    .select("id, custom_config")
    .eq("cv_id", cvId)
    .single();

  const prevCfg = ((existing?.custom_config as Record<string, unknown>) ??
    {}) as Record<string, unknown>;
  const cfg: Record<string, unknown> = {
    ...prevCfg,
    profile_name: profileName.trim(),
    profile_title: profileTitle.trim(),
  };
  if (profileTranslations) {
    cfg.profile_translations = profileTranslations;
  }

  if (existing) {
    const { error } = await supabase
      .from("cv_designs")
      .update({ custom_config: cfg })
      .eq("cv_id", cvId);
    if (error) throw new Error(`Failed to save profile info: ${error.message}`);
  } else {
    const { error } = await supabase.from("cv_designs").insert({
      cv_id: cvId,
      custom_config: cfg,
    });
    if (error) throw new Error(`Failed to save profile info: ${error.message}`);
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