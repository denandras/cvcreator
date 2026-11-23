#!/usr/bin/env python3
"""Card 8: measure the REAL in-browser exported PDF (ticked demo state)
against the live-DOM reference and the committed parity fixture."""
import json
import re
import subprocess
import sys

PDF = sys.argv[1]          # the browser-downloaded PDF (ticked state)
REF = json.load(open(sys.argv[2]))   # step9-ref.json (DOM measurement + probeRatios)
FIXTURE = json.load(open("/home/denandras/repos/cvcreator/scripts/fixtures/preview-demo-boxes.json"))
PT2PX = 4.0 / 3.0
TOL_CONTACT = 1.0   # card: ±1 px on the contact block's first line top
TOL_FLOW = 1.5      # the gate's row tolerance (unchanged result expected)

info = subprocess.run(["pdfinfo", PDF], capture_output=True, text=True).stdout
pages = int([l for l in info.splitlines() if l.startswith("Pages:")][0].split(":")[1])
print(f"PDF: {PDF}")
print(f"pages: {pages} (expected 2)")

WORD_RE = re.compile(
    r'<word xMin="([\d.-]+)" yMin="([\d.-]+)" xMax="([\d.-]+)" yMax="([\d.-]+)">(.*?)</word>'
)

def page_lines(page):
    out = subprocess.run(
        ["pdftotext", "-bbox", "-f", str(page), "-l", str(page), PDF, "-"],
        capture_output=True, text=True,
    ).stdout
    words = [(float(a), float(b), float(c), float(d), t) for a, b, c, d, t in WORD_RE.findall(out)]
    lines = []
    for w in sorted(words, key=lambda w: (w[1], w[0])):
        if lines and abs(lines[-1][0] - w[1]) < 1.2:
            lines[-1][1].append(w)
        else:
            lines.append([w[1], [w]])
    return [
        {"y": ln[0] * PT2PX, "x0": min(w[0] for w in ln[1]) * PT2PX,
         "text": " ".join(w[4] for w in ln[1])}
        for ln in lines
    ]

violations = []
p1, p2 = page_lines(1), page_lines(2)
print(f"PDF text lines: page1={len(p1)} page2={len(p2)}")

PHONE = "+36 1 456 7890"
EMAIL = "kovacs.tamas@example.com"
contact_p2 = [l for l in p2 if re.sub(r"\s+", " ", l["text"]).strip() in (PHONE, EMAIL)]
flow_p2 = [l for l in p2 if l not in contact_p2]
print(f"contact lines on page 2: {[ (l['text'], round(l['y'],2)) for l in contact_p2 ]}")
print(f"flow lines page 2 after removing contact: {len(flow_p2)}")

# ── Criterion 2: contact block first/second line top, PDF vs live DOM ────────
dom1 = REF["domFirstLineTopPx"]
dom2 = REF["domSecondLineTopPx"]
phone_line = next((l for l in contact_p2 if PHONE in l["text"]), None)
email_line = next((l for l in contact_p2 if EMAIL in l["text"]), None)
if phone_line:
    dy1 = phone_line["y"] - dom1
    ok1 = abs(dy1) <= TOL_CONTACT
    print(f"C2 first line (phone): PDF {phone_line['y']:.2f} px vs DOM ly {dom1:.2f} px → Δy {dy1:+.2f} px  {'PASS' if ok1 else 'FAIL'}")
    if not ok1: violations.append("C2 first line")
else:
    print("C2 first line: PHONE LINE NOT FOUND"); violations.append("C2 first line missing")
if email_line:
    dy2 = email_line["y"] - dom2
    ok2 = abs(dy2) <= TOL_CONTACT
    print(f"C2 second line (e-mail): PDF {email_line['y']:.2f} px vs DOM ly {dom2:.2f} px → Δy {dy2:+.2f} px  {'PASS' if ok2 else 'FAIL'}")
    if not ok2: violations.append("C2 second line")
else:
    print("C2 second line: EMAIL LINE NOT FOUND"); violations.append("C2 second line missing")

# ── Criterion 3 (in-browser export): the 47 flow rows vs the fixture ────────
items_p1 = [it for it in FIXTURE["items"] if it["page"] == 1]
items_p2 = [it for it in FIXTURE["items"] if it["page"] == 2]
print(f"fixture rows: page1={len(items_p1)} page2={len(items_p2)}")
if len(p1) == len(items_p1) and len(flow_p2) == len(items_p2):
    worst = 0.0; worst_lbl = ""
    for pg_items, pg_lines in ((items_p1, p1), (items_p2, flow_p2)):
        for it, ln in zip(pg_items, pg_lines):
            line_top = it.get("ly", it.get("y"))
            dy = ln["y"] - line_top
            if abs(dy) > abs(worst): worst, worst_lbl = dy, it["text"][:40]
            if abs(dy) > TOL_FLOW:
                violations.append(f"flow row Δy {dy:+.2f}: {it['text'][:40]}")
    print(f"flow rows (47 paired): max |Δy| = {abs(worst):.2f} px ({worst_lbl!r}) — gate tolerance {TOL_FLOW} → "
          f"{'PASS (matches the step-8 in-browser gate numbers)' if not any(v.startswith('flow') for v in violations) else 'FAIL'}")
else:
    violations.append(f"row counts differ: PDF {len(p1)}/{len(flow_p2)} vs fixture {len(items_p1)}/{len(items_p2)}")
    print(f"row counts differ: PDF {len(p1)}/{len(flow_p2)} vs fixture {len(items_p1)}/{len(items_p2)}")

print()
if violations:
    print("FAIL —", violations)
    sys.exit(1)
print("PASS — in-browser export: contact block within ±1 px of the live DOM; flow rows unchanged.")
