import type { Spacing } from "@/types/database";

export interface FontOption {
  value: string;
  label: string;
  stack: string;
  preview: string;
}

export const FONT_OPTIONS: FontOption[] = [
  {
    value: "inter",
    label: "Inter",
    stack: "'Inter', system-ui, sans-serif",
    preview: "Aa Bb Cc 123",
  },
  {
    value: "plus-jakarta",
    label: "Plus Jakarta Sans",
    stack: "'Plus Jakarta Sans', system-ui, sans-serif",
    preview: "Aa Bb Cc 123",
  },
  {
    value: "source-sans",
    label: "Source Sans 3",
    stack: "'Source Sans 3', system-ui, sans-serif",
    preview: "Aa Bb Cc 123",
  },
  {
    value: "lora",
    label: "Lora",
    stack: "'Lora', Georgia, serif",
    preview: "Aa Bb Cc 123",
  },
  {
    value: "garamond",
    label: "EB Garamond",
    stack: "'EB Garamond', Garamond, Georgia, serif",
    preview: "Aa Bb Cc 123",
  },
  {
    value: "merriweather",
    label: "Merriweather",
    stack: "'Merriweather', Georgia, serif",
    preview: "Aa Bb Cc 123",
  },
  {
    value: "manrope",
    label: "Manrope",
    stack: "'Manrope', system-ui, sans-serif",
    preview: "Aa Bb Cc 123",
  },
  {
    value: "noto-sans",
    label: "Noto Sans",
    stack: "'Noto Sans', system-ui, sans-serif",
    preview: "Aa Bb Cc 123",
  },
];

export function getFontStack(value: string): string {
  return FONT_OPTIONS.find((f) => f.value === value)?.stack ?? FONT_OPTIONS[0].stack;
}

export interface ColorPalette {
  id: string;
  label: string;
  primary: string;
  accent: string;
  bg: string;
  surface: string;
  text: string;
  muted: string;
}

export const COLOR_PALETTES: ColorPalette[] = [
  {
    id: "turquoise",
    label: "Turquoise",
    primary: "#0f766e",
    accent: "#14b8a6",
    bg: "#f0fdfa",
    surface: "#ccfbf1",
    text: "#134e4a",
    muted: "#5eada6",
  },
  {
    id: "soft-pink",
    label: "Soft Pink",
    primary: "#9d4d6d",
    accent: "#f9a8d4",
    bg: "#fdf2f8",
    surface: "#fce7f3",
    text: "#831843",
    muted: "#c084a8",
  },
  {
    id: "mint",
    label: "Mint",
    primary: "#3b8c6e",
    accent: "#86efac",
    bg: "#f0fdf4",
    surface: "#dcfce7",
    text: "#14532d",
    muted: "#74a892",
  },
  {
    id: "lavender",
    label: "Lavender",
    primary: "#6d5d8a",
    accent: "#c4b5fd",
    bg: "#faf5ff",
    surface: "#ede9fe",
    text: "#3b0764",
    muted: "#9d8fb5",
  },
  {
    id: "midnight",
    label: "Midnight",
    primary: "#1e293b",
    accent: "#14b8a6",
    bg: "#ffffff",
    surface: "#f8fafc",
    text: "#1e293b",
    muted: "#64748b",
  },
  {
    id: "warm-sand",
    label: "Warm Sand",
    primary: "#44403c",
    accent: "#d97706",
    bg: "#fffbeb",
    surface: "#fef3c7",
    text: "#292524",
    muted: "#78716c",
  },
  {
    id: "forest",
    label: "Forest",
    primary: "#14532d",
    accent: "#16a34a",
    bg: "#f0fdf4",
    surface: "#dcfce7",
    text: "#14532d",
    muted: "#4d7c5f",
  },
  {
    id: "rose",
    label: "Rose",
    primary: "#881337",
    accent: "#e11d48",
    bg: "#fff1f2",
    surface: "#ffe4e6",
    text: "#881337",
    muted: "#9f7474",
  },
  {
    id: "slate",
    label: "Slate",
    primary: "#0f172a",
    accent: "#3b82f6",
    bg: "#f8fafc",
    surface: "#e2e8f0",
    text: "#0f172a",
    muted: "#64748b",
  },
  {
    id: "classic",
    label: "Classic B&W",
    primary: "#000000",
    accent: "#333333",
    bg: "#ffffff",
    surface: "#f5f5f5",
    text: "#000000",
    muted: "#666666",
  },
  {
    id: "ocean",
    label: "Ocean",
    primary: "#0c4a6e",
    accent: "#0891b2",
    bg: "#ecfeff",
    surface: "#cffafe",
    text: "#0c4a6e",
    muted: "#0e7490",
  },
];

export interface TemplateConfig {
  id: string;
  label: string;
  description: string;
  headingStyle: "underline" | "border" | "filled" | "minimal";
  defaultPalette: string;
  defaultFont: string;
  twoColumnDefault: boolean;
}

export const TEMPLATES: TemplateConfig[] = [
  {
    id: "clean",
    label: "Clean",
    description: "Minimal, professional, easy to read",
    headingStyle: "border",
    defaultPalette: "slate",
    defaultFont: "inter",
    twoColumnDefault: false,
  },
  {
    id: "modern",
    label: "Modern",
    description: "Contemporary with turquoise highlights",
    headingStyle: "filled",
    defaultPalette: "turquoise",
    defaultFont: "plus-jakarta",
    twoColumnDefault: false,
  },
  {
    id: "creative",
    label: "Creative",
    description: "Bold colors, two-column layout",
    headingStyle: "filled",
    defaultPalette: "mint",
    defaultFont: "lora",
    twoColumnDefault: true,
  },
  {
    id: "minimalist",
    label: "Minimalist",
    description: "Ultra-clean, maximum whitespace",
    headingStyle: "minimal",
    defaultPalette: "classic",
    defaultFont: "manrope",
    twoColumnDefault: false,
  },
];

export function getTemplate(id: string): TemplateConfig {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}

export function getPalette(id: string): ColorPalette {
  return COLOR_PALETTES.find((p) => p.id === id) ?? COLOR_PALETTES[0];
}

export const SPACING_VALUES: Record<Spacing, { section: number; item: number; lineHeight: number }> = {
  compact: { section: 12, item: 4, lineHeight: 1.4 },
  normal: { section: 20, item: 8, lineHeight: 1.6 },
  relaxed: { section: 32, item: 12, lineHeight: 1.8 },
};

// Page sizes for the preview
export const PAGE_WIDTH = 794; // A4 at 96 DPI
export const PAGE_HEIGHT = 1123;