#!/usr/bin/env python3
"""Card 8: diff a fresh default-state preview capture against the committed
parity fixture (proves the contact-block change moved no preview row)."""
import json
import sys

fixture = json.load(open("/home/denandras/repos/cvcreator/scripts/fixtures/preview-demo-boxes.json"))
fresh = json.load(open(sys.argv[1]))

fa, fb = fixture["items"], fresh["items"]
print("fixture items:", len(fa), "| fresh items:", len(fb),
      "| fixture pages:", fixture.get("pages"), "| fresh pages:", fresh.get("pages"))

if len(fa) != len(fb):
    print("COUNT MISMATCH")

max_dy = max_dx = max_dw = max_dh = 0.0
worst = None
mismatched_text = []
for i, (a, b) in enumerate(zip(fa, fb)):
    for k in ("y", "x", "ly", "lx", "lw", "w", "h"):
        va, vb = a.get(k), b.get(k)
        if isinstance(va, (int, float)) and isinstance(vb, (int, float)):
            d = abs(va - vb)
            if k in ("y", "ly") and d > max_dy:
                max_dy, worst = d, (i, k, a.get("text"))
            if k in ("x", "lx") and d > max_dx:
                max_dx = d
            if k in ("lw", "w") and d > max_dw:
                max_dw = d
            if k == "h" and d > max_dh:
                max_dh = d
    if a.get("text") != b.get("text"):
        mismatched_text.append((i, a.get("text"), b.get("text")))

print(f"max |Δy/Δly| = {max_dy:.3f} px  (worst: {worst})")
print(f"max |Δx/Δlx| = {max_dx:.3f} px")
print(f"max |Δw/Δlw| = {max_dw:.3f} px")
print(f"max |Δh|     = {max_dh:.3f} px")
print("text mismatches:", len(mismatched_text), mismatched_text[:3])
print("fixture probeRatios keys:", sorted(fixture.get("probeRatios", {}).keys()))
print("fresh   probeRatios keys:", sorted(fresh.get("probeRatios", {}).keys()))
print("shared probeRatios identical:",
      all(abs(fixture["probeRatios"][k] - fresh["probeRatios"][k]) < 1e-6
          for k in fixture["probeRatios"] if k in fresh["probeRatios"]))
print("fontBox400:", fresh.get("fontBox400"))
