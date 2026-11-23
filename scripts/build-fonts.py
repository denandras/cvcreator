#!/usr/bin/env python3
"""Build merged latin+latin-ext TTF fonts for cvcreator PDF export.

Fontsource ships complementary subsets (latin has core, latin-ext has
extended — neither is complete). jsPDF's TTF parser needs one clean font
file per style with a single format-4 cmap, so we merge the two subsets
with fontTools and write the result to public/fonts/cv/, plus manifest.json:

  { "<app-font-id>": { "400": "inter-400.ttf", "400-italic": ..., ... } }

Step 8 additions:
  * 500/600 upright statics (the preview's font-medium / font-semibold faces).
  * GPOS/GSUB are DROPPED from the merged files. The browser applies GPOS
    pair kerning and GSUB ligatures to the preview's webfont; jsPDF renders
    embedded TTFs from raw cmap+hmtx and cannot (its kerning path only runs
    for the built-in AFM fonts). A font with no GPOS/GSUB makes BOTH engines
    reduce to the same pure-advance model — width parity by construction.
    (Kerning/ligatures are a micro-typography nicety; parity wins.)
  * fonts.css: @font-face rules for every merged file, served to the PREVIEW
    by layout.tsx (replacing the Google Fonts css2 link). One byte-source for
    both renderers — the preview's metrics can no longer drift from the
    export's: Google is mid-rollout on Inter and was observed serving two
    different builds of the SAME family to the same machine on different
    page loads (digits 0.616em vs 0.572em), which made the preview↔PDF row
    widths wobble by 2-4% per load.

Run again after adding fonts to FONT_OPTIONS in src/lib/design-constants.ts.
Cached entries are skipped (delete a file to force a rebuild for it).
"""
import json
import os
import urllib.request

from fontTools.merge import Merger
from fontTools.ttLib import TTFont

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "public", "fonts", "cv")
os.makedirs(OUT, exist_ok=True)

CDN = "https://cdn.jsdelivr.net/fontsource/fonts"

# app font id -> (fontsource family id, has-italics, CSS family name)
FONTS = {
    "inter": ("inter", True, "Inter"),
    "plus-jakarta": ("plus-jakarta-sans", False, "Plus Jakarta Sans"),
    "source-sans": ("source-sans-3", True, "Source Sans 3"),
    "lora": ("lora", True, "Lora"),
    "garamond": ("eb-garamond", True, "EB Garamond"),
    "merriweather": ("merriweather", True, "Merriweather"),
    "manrope": ("manrope", False, "Manrope"),
    "noto-sans": ("noto-sans", True, "Noto Sans"),
    "poppins": ("poppins", True, "Poppins"),
    "montserrat": ("montserrat", True, "Montserrat"),
    "roboto": ("roboto", True, "Roboto"),
    "open-sans": ("open-sans", True, "Open Sans"),
    "playfair": ("playfair-display", True, "Playfair Display"),
    "crimson": ("crimson-pro", True, "Crimson Pro"),
    "raleway": ("raleway", True, "Raleway"),
    "karla": ("karla", True, "Karla"),
    "ibm-plex": ("ibm-plex-sans", True, "IBM Plex Sans"),
}

STYLES = [
    # 400/700 upright + their italics are the historic set; 500/600 upright
    # are the preview's font-medium (subtitle, year) / font-semibold (entry
    # titles, minimal headings) faces — the exporter registers them for
    # weight parity (REPORT.md §4 Step 8). Families without a static 500/600
    # on Fontsource simply don't get the file and the exporter falls back.
    ("400", "normal"),
    ("700", "normal"),
    ("500", "normal"),
    ("600", "normal"),
    ("400", "italic"),
    ("700", "italic"),
]

# Layout shaping tables dropped for engine parity (see module docstring).
DROP_TABLES = ("GPOS", "GSUB")

manifest = {}
report = []
for fid, (family, has_italic, css_family) in FONTS.items():
    entry = {}
    for weight, slant in STYLES:
        if slant == "italic" and not has_italic:
            continue
        key = f"{weight}-{slant}" if slant == "italic" else weight
        fname = f"{fid}-{key}.ttf"
        dst = os.path.join(OUT, fname)
        rebuild = not (os.path.exists(dst) and os.path.getsize(dst) > 10000)
        if not rebuild:
            # cached — but the Step-8 parity strip may not have run on it yet
            f = TTFont(dst)
            if any(t in f.keys() for t in DROP_TABLES):
                rebuild = True
        if not rebuild:
            entry[key] = fname
            report.append(f"{fid} {key}: cached")
            continue
        try:
            latin = urllib.request.urlopen(
                f"{CDN}/{family}@latest/latin-{weight}-{slant}.ttf", timeout=30
            ).read()
            ext = urllib.request.urlopen(
                f"{CDN}/{family}@latest/latin-ext-{weight}-{slant}.ttf", timeout=30
            ).read()
        except Exception as e:
            report.append(f"{fid} {key}: DOWNLOAD FAIL {e}")
            continue

        tmp_l, tmp_e = dst + ".latin", dst + ".ext"
        with open(tmp_l, "wb") as f:
            f.write(latin)
        with open(tmp_e, "wb") as f:
            f.write(ext)

        merger = Merger()
        try:
            font = merger.merge([tmp_l, tmp_e])
            # Engine parity: drop layout shaping so the browser (which applies
            # GPOS kerning / GSUB ligatures) and jsPDF (which cannot) both
            # reduce to pure cmap+hmtx advances.
            for t in DROP_TABLES:
                if t in font.keys():
                    del font[t]
            font.save(dst)
            entry[key] = fname
            report.append(f"{fid} {key}: merged {os.path.getsize(dst) // 1024}KB")
        except Exception as e:
            report.append(f"{fid} {key}: MERGE FAIL {type(e).__name__} {e}")
        finally:
            for p in (tmp_l, tmp_e):
                if os.path.exists(p):
                    os.remove(p)
    if entry:
        manifest[fid] = entry

with open(os.path.join(OUT, "manifest.json"), "w") as f:
    json.dump(manifest, f, indent=1)

# fonts.css — the preview's @font-face source (layout.tsx links this instead
# of Google Fonts, so the preview renders with the SAME bytes the exporter
# embeds). Weights 400/500/600/700 upright + italics, one rule per file.
CSS_WEIGHT = {"400": "400", "500": "500", "600": "600", "700": "700"}


rules = []
for fid, (family, has_italic, css_family) in FONTS.items():
    for weight, slant in STYLES:
        if slant == "italic" and not has_italic:
            continue
        key = f"{weight}-{slant}" if slant == "italic" else weight
        fname = manifest.get(fid, {}).get(key)
        if not fname:
            continue
        style = "italic" if slant == "italic" else "normal"
        rules.append(
            "@font-face {\n"
            f"  font-family: '{css_family}';\n"
            f"  font-style: {style};\n"
            f"  font-weight: {CSS_WEIGHT[weight]};\n"
            "  font-display: swap;\n"
            f"  src: url('/fonts/cv/{fname}') format('truetype');\n"
            "}"
        )


css = (
    "/* AUTO-GENERATED by scripts/build-fonts.py — DO NOT EDIT.\n"
    " * The CV preview's fonts, served from the repo (layout.tsx links this\n"
    " * file INSTEAD of Google Fonts). The merged TTFs here are the SAME\n"
    " * bytes src/lib/pdf-export.ts embeds, with GPOS/GSUB stripped so the\n"
    " * browser and jsPDF reduce to identical cmap+hmtx advances (preview↔PDF\n"
    " * width parity by construction; Google's css2 was observed serving two\n"
    " * different builds of Inter to the same machine on different loads).\n"
    " * Regenerate: uv run --with fonttools python scripts/build-fonts.py\n"
    " */\n" + "\n".join(rules) + "\n"
)
with open(os.path.join(OUT, "fonts.css"), "w") as f:
    f.write(css)

print("\n".join(report))
print(f"\nfamilies: {len(manifest)}, styles total: {sum(len(v) for v in manifest.values())}")
print(f"fonts.css: {len(rules)} @font-face rules -> {os.path.join(OUT, 'fonts.css')}")

# Coverage gate: every built file must carry Hungarian (ő/Ű live only in the
# latin-ext subset) plus the European letter set. A missing glyph is missing in
# BOTH renderers — the PDF draws .notdef, the browser silently falls back to a
# second face — so this is a hard check, not a report line.
import subprocess
import sys

_coverage = subprocess.run(
    [sys.executable, os.path.join(REPO, "scripts", "check-font-coverage.py")],
    capture_output=True,
    text=True,
)
print(_coverage.stdout.rstrip())
if _coverage.returncode != 0:
    print("COVERAGE CHECK FAILED — fix the glyph gaps above before shipping these fonts.")
    sys.exit(_coverage.returncode)