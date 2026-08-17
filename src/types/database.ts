// Database types matching the Supabase schema

export type SectionType =
  | "education"
  | "experience"
  | "skills"
  | "awards"
  | "projects"
  | "custom";

export type EntrySortMode = "year_asc" | "year_desc" | "custom";

export type Spacing = "compact" | "normal" | "relaxed";

export interface Profile {
  id: string;
  display_name: string | null;
  default_design_config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CV {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface CVSection {
  id: string;
  cv_id: string;
  title: string;
  section_type: SectionType;
  is_enabled: boolean;
  sort_order: number;
  entry_sort_mode: EntrySortMode;
  layout_config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CVEntry {
  id: string;
  section_id: string;
  year: number | null;
  is_enabled: boolean;
  sort_order: number;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CVTranslation {
  id: string;
  entry_id: string;
  language: string;
  title: string | null;
  organization: string | null;
  description: string | null;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CVDesign {
  id: string;
  cv_id: string;
  template: string;
  font_family: string;
  primary_color: string;
  accent_color: string;
  spacing: Spacing;
  border_radius: number;
  page_margin: number;
  custom_config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// Form / input types for server actions

export interface SectionInput {
  cv_id: string;
  title: string;
  section_type?: SectionType;
  is_enabled?: boolean;
  sort_order?: number;
  entry_sort_mode?: EntrySortMode;
  layout_config?: Record<string, unknown>;
}

export interface EntryInput {
  section_id: string;
  year?: number | null;
  is_enabled?: boolean;
  sort_order?: number;
  data?: Record<string, unknown>;
}

export interface TranslationInput {
  entry_id: string;
  language: string;
  title?: string | null;
  organization?: string | null;
  description?: string | null;
  data?: Record<string, unknown>;
}

export interface DesignInput {
  cv_id: string;
  template?: string;
  font_family?: string;
  primary_color?: string;
  accent_color?: string;
  spacing?: Spacing;
  border_radius?: number;
  page_margin?: number;
  custom_config?: Record<string, unknown>;
}

// Composite types for the editor

export interface EntryWithTranslations extends CVEntry {
  translations: CVTranslation[];
}

export interface SectionWithEntries extends CVSection {
  entries: EntryWithTranslations[];
}

export interface CVFullData {
  cv: CV;
  design: CVDesign | null;
  sections: SectionWithEntries[];
}