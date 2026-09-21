#!/usr/bin/env python3
"""Build merged latin+latin-ext TTF fonts for cvcreator PDF export.

Fontsource ships complementary subsets (latin has core, latin-ext has
extended — neither is complete). jsPDF's TTF parser needs one clean font
file per style with a single format-4 cmap, so we merge the two subsets
with fontTools and write the result to public/fonts/cv/, plus manifest.json:

  { "<app-font-id>": { "400": "inter-400.ttf", "400-italic": ..., ... } }

Run again after adding fonts to FONT_OPTIONS in src/lib/design-constants.ts.
Cached entries are skipped (delete a file to force a rebuild for it).
"""
import json, os, urllib.request

from fontTools.merge import Merger

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "public", "fonts", "cv")
os.makedirs(OUT, exist_ok=True)

CDN = "https://cdn.jsdelivr.net/fontsource/fonts"

# app font id -> fontsource family id, has-italics
FONTS = {
    "inter": ("inter", True),
    "plus-jakarta": ("plus-jakarta-sans", False),
    "source-sans": ("source-sans-3", True),
    "lora": ("lora", True),
    "garamond": ("eb-garamond", True),
    "merriweather": ("merriweather", True),
    "manrope": ("manrope", False),
    "noto-sans": ("noto-sans", True),
    "poppins": ("poppins", True),
    "montserrat": ("montserrat", True),
    "roboto": ("roboto", True),
    "open-sans": ("open-sans", True),
    "playfair": ("playfair-display", True),
    "crimson": ("crimson-pro", True),
    "raleway": ("raleway", True),
    "karla": ("karla", True),
    "ibm-plex": ("ibm-plex-sans", True),
}

STYLES = [
    ("400", "normal"),
    ("700", "normal"),
    ("400", "italic"),
    ("700", "italic"),
]

manifest = {}
report = []
for fid, (family, has_italic) in FONTS.items():
    entry = {}
    for weight, slant in STYLES:
        if slant == "italic" and not has_italic:
            continue
        key = f"{weight}-{slant}" if slant == "italic" else weight
        fname = f"{fid}-{key}.ttf"
        dst = os.path.join(OUT, fname)
        if os.path.exists(dst) and os.path.getsize(dst) > 10000:
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

print("\n".join(report))
print(f"\nfamilies: {len(manifest)}, styles total: {sum(len(v) for v in manifest.values())}")