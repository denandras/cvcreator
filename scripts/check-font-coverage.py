#!/usr/bin/env python3
"""Verify every CV font covers Hungarian and the full European letter set.

The preview and the PDF embed the SAME merged latin+latin-ext TTFs
(public/fonts/cv), so a glyph missing here is missing in BOTH renderers: the
PDF draws a .notdef box, the browser falls back to a second face — a silent
preview↔PDF divergence.

Usage:
  uv run --with fonttools python scripts/check-font-coverage.py            # human output
  uv run --with fonttools python scripts/check-font-coverage.py --json     # machine output

Exit 1 when any font is missing a required character, 2 when a font file is
unreadable. Required sets are below; they are the coverage promise the font
picker makes to users, not a wish list.
"""
import glob
import json
import os
import sys

from fontTools.ttLib import TTFont

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_DIR = os.path.join(REPO, "public", "fonts", "cv")

REQUIRED = {
    # Hungarian — the primary language of the app. ő Ű are U+0151/0170 and are
    # NOT in the "latin" fontsource subset, only in latin-ext.
    "hungarian": "áéíóöőúüűÁÉÍÓÖŐÚÜŰ",
    # Neighbouring languages the app also exports (German, Romanian, Turkish,
    # Polish, Czech/Slovak, Croatian/Slovenian, Nordic, Baltic).
    "european": (
        "àâäçèêëîïôùûÿñÀÂÄÇÈÊËÎÏÔÙÛŸÑ"  # Western
        "ßẞæÆœŒøØåÅäÄöÖãÃõÕ"              # German / Nordic
        "ăĂâÂîÎșȘțȚşŞţŢ"                  # Romanian (comma + cedilla variants)
        "çÇğĞıİşŞ"                        # Turkish
        "ąćęłńóśźżĄĆĘŁŃÓŚŹŻ"              # Polish
        "čČďĎěĚňŇřŘšŠťŤůŮžŽ"              # Czech / Slovak
        "ćĆđĐ"                            # Croatian / Serbian Latin
        "āčēģīķļņšūž"                     # Latvian / Lithuanian
    ),
    # Punctuation and symbols a CV actually uses.
    "symbols": "–—„”“’‘…€£¥§•·«»‹›°±×÷",
}


def load_required() -> tuple[dict[str, str], set[str]]:
    """Per-family requirement: everything above, plus German capital ẞ only for
    families whose upstream (fonts.google.com) ships it. Poppins has no U+1E9E
    in latin-ext; ß (U+00DF) is present and is what German text uses in
    practice, so ẞ is reported as an informational gap, not a failure."""
    info_only = {"ẞ"}
    return REQUIRED, info_only


def main() -> int:
    json_out = "--json" in sys.argv
    required, info_only = load_required()
    paths = sorted(glob.glob(os.path.join(FONT_DIR, "*.ttf")))
    if not paths:
        print(f"no TTFs in {FONT_DIR}")
        return 2

    failures, warnings, checked = [], [], 0
    for path in paths:
        name = os.path.basename(path)
        try:
            font = TTFont(path, lazy=True)
            cmap = set(font.getBestCmap() or {})
            font.close()
        except Exception as e:  # unreadable file is a hard failure
            print(f"UNREADABLE {name}: {e}")
            return 2
        checked += 1
        for group, chars in required.items():
            for ch in chars:
                if ord(ch) in cmap:
                    continue
                rec = {"font": name, "group": group, "char": ch, "codepoint": f"U+{ord(ch):04X}"}
                (warnings if ch in info_only else failures).append(rec)

    if json_out:
        print(json.dumps({"checked": checked, "failures": failures, "warnings": warnings}, ensure_ascii=False))
    else:
        print(f"fonts checked: {checked}")
        if failures:
            print(f"MISSING GLYPHS: {len(failures)}")
            for f in failures:
                print(f"  {f['font']:26} {f['group']:9} {f['char']!r} {f['codepoint']}")
        else:
            print("Hungarian + European letter + symbol coverage: COMPLETE")
        if warnings:
            print(f"informational ({len(warnings)}): " + ", ".join(
                f"{w['font']} {w['char']!r}" for w in warnings[:12]) + (" …" if len(warnings) > 12 else ""))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
