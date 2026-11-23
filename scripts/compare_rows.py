#!/usr/bin/env python3
"""Row-level preview-vs-PDF parity comparator (REPORT.md Step 7 gate logic).

Adapted from .plan/cv-parity/compare_rows.py. Differences from the original:
  * The compared quantity is the INK LINE TOP on both sides (per the parity
    chain's owner direction): `pdftotext -bbox` word yMin on the PDF side vs
    the DOM text-line rect top (`ly`, from a Range over the row's text) on the
    preview side — NOT the element box top, which can agree while the text
    inside the row is offset. When an item has no `ly` (legacy captures, e.g.
    the pre-fix baseline .plan/cv-parity/baseline/preview-1-boxes.json), it
    falls back to the element top `y` so old captures still compare.
  * Pairing is PER PAGE (PDF page N lines vs preview items of page N), in
    reading order. A page-count or row-count difference is itself a violation.
  * Δelement (vs the element box top `y`) is printed for reference.

Usage:
  python3 scripts/compare_rows.py PREVIEW_BOXES.json WORDS-1.xml [WORDS-2.xml ...]

PREVIEW_BOXES.json  produced by scripts/capture-preview-boxes.js (see its
                    header); items = one per rendered text line, page-relative
                    CSS px. `pages` (or the max item `page`) is the preview's
                    rendered page count.
WORDS-N.xml         `pdftotext -bbox -f N -l N` output for PDF page N (pt,
                    top-left origin). 1 CSS px = 0.75 pt, so pt * 4/3.

Exit 0 = parity within TOL (default 1.5 px, override with the TOL env var).
Exit 1 = max|Δy| > TOL, or preview/PDF page counts differ, or any page's row
counts differ, or — Step 8 acceptance — any paired row with ink-line
geometry (lx/lw in the fixture) violates the horizontal tolerances:
|Δx| > X_TOL (default 0.5 px, left ink edge) or |Δ ink width| > W_TOL_PCT
(default 1 % of the preview row's line width). Rows from legacy captures
without lx/lw skip the horizontal checks (y only).
Exit 2 = usage/parse error.
"""
import os
import re
import sys

TOL = float(os.environ.get("TOL", "1.5"))
X_TOL = float(os.environ.get("X_TOL", "0.5"))
W_TOL_PCT = float(os.environ.get("W_TOL_PCT", "1.0"))
PT2PX = 4.0 / 3.0
PAGE_H = 1123.0
WORD_RE = re.compile(
    r'<word xMin="([\d.-]+)" yMin="([\d.-]+)" xMax="([\d.-]+)" yMax="([\d.-]+)">(.*?)</word>'
)


def pdf_page_lines(path):
    """Group one page's words into text lines (words with yMin within 1.2 px)."""
    s = open(path, encoding="utf-8").read()
    words = [
        (float(a), float(b), float(c), float(d), t)
        for a, b, c, d, t in WORD_RE.findall(s)
    ]
    lines = []
    for w in sorted(words, key=lambda w: (w[1], w[0])):
        if lines and abs(lines[-1][0] - w[1]) < 1.2:
            lines[-1][1].append(w)
        else:
            lines.append([w[1], [w]])
    out = []
    for y, ln in lines:
        out.append(
            {
                # page-relative CSS px (the caller passes one file per page)
                "y": y * PT2PX,
                "x0": min(x[0] for x in ln) * PT2PX,
                "x1": max(x[2] for x in ln) * PT2PX,
                "text": " ".join(x[4] for x in ln),
            }
        )
    return out


def main():
    if len(sys.argv) < 3:
        print(__doc__, file=sys.stderr)
        return 2
    import json

    boxes_path = sys.argv[1]
    words_paths = sys.argv[2:]
    boxes = json.load(open(boxes_path, encoding="utf-8"))
    items = boxes.get("items") or []

    # Preview side: group items per page; infer page count.
    preview_pages = {}
    for it in items:
        pg = int(it.get("page", 1))
        preview_pages.setdefault(pg, []).append(it)
    preview_page_count = int(boxes.get("pages", 0)) or (
        max(preview_pages) if preview_pages else 1
    )
    for pg in preview_pages:
        if pg > preview_page_count:
            preview_page_count = pg

    pdf_pages = {i + 1: pdf_page_lines(p) for i, p in enumerate(words_paths)}
    pdf_page_count = len(words_paths)

    violations = []
    print(f"preview: {boxes_path}")
    print(
        f"  {preview_page_count} page(s), {len(items)} text rows; "
        f"PDF: {pdf_page_count} page(s), {sum(len(v) for v in pdf_pages.values())} text lines"
    )
    if preview_page_count != pdf_page_count:
        violations.append(
            f"page count differs: preview {preview_page_count} vs PDF {pdf_page_count}"
        )
    for pg in range(1, max(preview_page_count, pdf_page_count) + 1):
        p_items = preview_pages.get(pg, [])
        p_lines = pdf_pages.get(pg, [])
        if len(p_items) != len(p_lines):
            violations.append(
                f"page {pg}: row count differs: preview {len(p_items)} vs PDF {len(p_lines)}"
            )

    print(f"\n{'#':>2} {'pg':>2} {'tag':5} {'fs':>7} {'domY(el)':>9} {'domLY(line)':>11} "
          f"{'pdfY':>9} {'dEl':>7} {'dY':>7} {'dX':>7} {'dW':>7} {'dW%':>6}  text")
    worst = 0.0
    worst_label = ""
    worst_x = 0.0
    worst_w = 0.0
    paired = 0
    x_checked = 0
    for pg in range(1, max(preview_page_count, pdf_page_count) + 1):
        p_items = preview_pages.get(pg, [])
        p_lines = pdf_pages.get(pg, [])
        for i in range(min(len(p_items), len(p_lines))):
            it = p_items[i]
            ln = p_lines[i]
            line_top = it.get("ly", it.get("y"))
            el_top = it.get("y", line_top)
            dy = ln["y"] - line_top
            del_ = ln["y"] - el_top
            text = it.get("text") or ""
            paired += 1
            if abs(dy) > worst:
                worst = abs(dy)
                worst_label = text[:40]
            # Horizontal parity (Step 8): the left ink edge (word xMin vs the
            # DOM line rect's lx) and the ink-line width. Width conventions
            # differ at the LAST glyph: the DOM line rect INCLUDES the row's
            # trailing letter-space, poppler's word xMax EXCLUDES the final Tc
            # (measured: poppler width = natural + (n−1)·Tc). So the
            # comparable preview width is lw − lsPx (lsPx from the capture;
            # 0 for untracked rows). Only when the capture carries line
            # geometry — legacy fixtures skip these columns.
            dx = dw = None
            dwpct = None
            dom_ink_w = 0.0
            has_lx = isinstance(it.get("lx"), (int, float))
            has_lw = isinstance(it.get("lw"), (int, float))
            if has_lx:
                dx = ln["x0"] - it["lx"]
                if abs(dx) > worst_x:
                    worst_x = abs(dx)
            if has_lx and has_lw and it["lw"] > 0:
                ls_px = it.get("lsPx", 0) or 0
                dom_ink_w = it["lw"] - ls_px
                dw = (ln["x1"] - ln["x0"]) - dom_ink_w
                dwpct = abs(dw) / dom_ink_w * 100.0 if dom_ink_w > 0 else None
                x_checked += 1
                if dwpct is not None and dwpct > worst_w:
                    worst_w = dwpct
            flag = ""
            if abs(dy) > TOL:
                flag = "  <-- VIOLATION"
                violations.append(
                    f"page {pg} row {i} ({text[:40]!r}): pdfY {ln['y']:.2f} vs "
                    f"line top {line_top:.2f} (Δy {dy:+.2f} px > {TOL})"
                )
            if dx is not None and abs(dx) > X_TOL:
                flag = "  <-- VIOLATION"
                violations.append(
                    f"page {pg} row {i} ({text[:40]!r}): Δx {dx:+.2f} px "
                    f"(pdf {ln['x0']:.2f} vs dom lx {it['lx']:.2f} > {X_TOL})"
                )
            if dwpct is not None and dwpct > W_TOL_PCT:
                flag = "  <-- VIOLATION"
                violations.append(
                    f"page {pg} row {i} ({text[:40]!r}): Δ ink width "
                    f"{dw:+.2f} px = {dwpct:.2f}% of {dom_ink_w:.2f} (> {W_TOL_PCT}%)"
                )
            print(
                f"{i:2d} {pg:2d} {str(it.get('tag',''))[:5]:5} {str(it.get('fs',''))[:7]:>7} "
                f"{el_top:9.2f} {line_top:11.2f} {ln['y']:9.2f} {del_:7.2f} {dy:7.2f} "
                f"{('%+7.2f' % dx) if dx is not None else '      -'} "
                f"{('%+7.2f' % dw) if dw is not None else '      -'} "
                f"{('%5.2f' % dwpct) if dwpct is not None else '    -'}  "
                f"{(it.get('text') or '')[:38]}{flag}"
            )
        # unpaired leftovers on this page
        for i in range(min(len(p_items), len(p_lines)), max(len(p_items), len(p_lines))):
            side = "preview row" if i < len(p_items) else "PDF line"
            which = (p_items[i].get("text", "")[:40] if i < len(p_items)
                     else p_lines[i]["text"][:40])
            print(f"{i:2d} {pg:2d}  UNPAIRED {side}: {which!r} (row counts differ)")

    print(f"\nmax |Δy| over paired rows: {worst:.2f} px ({worst_label!r}) (tolerance {TOL})")
    if x_checked:
        print(
            f"max |Δx|: {worst_x:.2f} px (tolerance {X_TOL}); "
            f"max |Δ ink width|: {worst_w:.2f}% over {x_checked} rows (tolerance {W_TOL_PCT}%)"
        )
    if violations:
        print("\nFAIL — parity violations:")
        for v in violations:
            print(f"  - {v}")
        return 1
    print(
        f"PASS — all {paired} paired rows within {TOL} px; "
        f"page counts agree ({pdf_page_count})."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
