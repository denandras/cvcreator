/**
 * capture-preview-boxes.js — regenerate scripts/fixtures/preview-demo-boxes.json
 * (the preview-side input of scripts/cv-row-parity.js, the Step-7 parity gate).
 *
 * THIS IS A DEVTOOLS SNIPPET, NOT A NODE SCRIPT — it must run inside the live
 * app page (it needs the real DOM, the real webfonts and the rendered pages).
 * It extends the audit snippet from .plan/cv-parity/REPORT.md §5: instead of
 * just printing measure/content heights, it walks every RENDERED page and
 * emits one item per text line with the element box AND the text-line rect
 * (Range.getClientRects) — the ink-line-top quantities the gate compares
 * against `pdftotext -bbox` word yMin.
 *
 * HOW TO USE
 *   1. Start the dev server:  npx next dev -p 3001
 *   2. Open http://localhost:3001/demo, clear localStorage, reload, and wait
 *      for the webfonts and the rendered pages (2 pages for the demo CV):
 *        document.fonts.status === "loaded"
 *        document.querySelectorAll('div[style*="min-height: 1123px"]').length === 2
 *   3. Paste this whole file into DevTools Console and run it. It copies the
 *      JSON to your clipboard (the final copy(out)) and prints it.
 *   4. Save the output as scripts/fixtures/preview-demo-boxes.json and re-run
 *      the gate:
 *        node_modules/.bin/sucrase-node scripts/cv-row-parity.js
 *
 * NOTES
 *   - Coordinates are UNSCALED CSS px, page-relative (the page div's inline
 *     transform scale is divided out), so the capture is valid at any preview
 *     scale / viewport. Layout is scale-invariant; a re-capture on the same
 *     tree reproduces the numbers exactly (verified: 0.000 px diff).
 *   - Items are emitted in DOM order (= reading order for the demo CV). The
 *     demo has no two-column sections; a CV that interleaves columns would
 *     need y-sorting before the comparator's positional pairing.
 *   - fontBox400 records the canvas fontBoundingBox metrics of the PAGE'S
 *     REAL font stack (read from the page's computed style) — the metric the
 *     export path's computeBaselineRatio canvas FALLBACK measures. NOTE: the
 *     fixture must use the page's own stack: an earlier capture hardcoded
 *     'Plus Jakarta Sans' while the demo CV renders Inter, which poisoned
 *     the step-7 --browser-metrics run (it fed Inter rows PJS metrics).
 *   - probeRatios carries the per-style baseline anchor ratios measured the
 *     SAME way pdf-export.ts probeStyleRatios() measures them at export
 *     time (one off-screen line box per (weight, fs, strut), baseline via an
 *     empty inline-block). Key format (shared with the exporter):
 *     `${italic?"i":""}${weight}|${fs}|${strut}` with fs/strut rounded to 2
 *     decimals. Feed this field to exportToPdf({ baselineRatios }) via the
 *     gate's --browser-metrics mode to reproduce the in-browser placement.
 */
(() => {
  const pages = [...document.querySelectorAll('div[style*="min-height: 1123px"]')];
  const out = {
    source:
      "Live preview DOM of the /demo CV, captured with scripts/capture-preview-boxes.js (extends the audit snippet in .plan/cv-parity/REPORT.md S5). Unscaled CSS px, page-relative. One item per rendered text line.",
    captured: new Date().toISOString().slice(0, 10) + " — fill in the tree state",
    pageW: 794,
    pageH: 1123,
    pages: pages.length,
    items: [],
  };
  const sm = (pages[0].getAttribute("style") || "").match(/scale\(([\d.]+)\)/);
  out.scaleAtCapture = sm ? parseFloat(sm[1]) : 1;
  // The page's REAL font stack (the export measures this same stack).
  const fontStack = getComputedStyle(pages[0]).fontFamily;
  pages.forEach((page, pi) => {
    const pg = page.getBoundingClientRect();
    // The content wrapper carries z-index: 1 (React serializes the style
    // with or without spaces — match both).
    const content = [...page.children].find((c) => /z-index:\s*1/.test(c.getAttribute("style") || ""));
    if (!content) throw new Error("page " + (pi + 1) + ": content wrapper not found");
    const rows = [];
    const walk = (el) => {
      for (const child of el.childNodes) {
        if (child.nodeType === 3 && child.textContent.trim()) { rows.push(el); break; }
      }
      for (const child of el.children) walk(child);
    }
    walk(content);
    rows.forEach((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = [...range.getClientRects()].filter((x) => x.width > 0 && x.height > 0);
      rects.forEach((rr) => {
        out.items.push({
          page: pi + 1,
          tag: el.tagName,
          text: el.textContent.replace(/\s+/g, " ").trim().slice(0, 90),
          x: +((r.left - pg.left) / out.scaleAtCapture).toFixed(3),
          y: +((r.top - pg.top) / out.scaleAtCapture).toFixed(3),
          w: +(r.width / out.scaleAtCapture).toFixed(3),
          h: +(r.height / out.scaleAtCapture).toFixed(3),
          lx: +((rr.left - pg.left) / out.scaleAtCapture).toFixed(3),
          ly: +((rr.top - pg.top) / out.scaleAtCapture).toFixed(3),
          lb: +((rr.bottom - pg.top) / out.scaleAtCapture).toFixed(3),
          lw: +(rr.width / out.scaleAtCapture).toFixed(3),
          rectH: +(rr.height / out.scaleAtCapture).toFixed(3),
          fs: cs.fontSize,
          cssLH: cs.lineHeight,
          weight: cs.fontWeight,
          italic: cs.fontStyle === "italic",
          // Computed letter-spacing in px (0 when 'normal') — the comparator
          // uses it to align width conventions: the DOM line rect INCLUDES
          // the trailing letter-space, poppler's word xMax EXCLUDES the final
          // Tc, so the comparable width is lw − lsPx.
          lsPx: cs.letterSpacing === "normal" ? 0 : parseFloat(cs.letterSpacing) || 0,
        });
      });
    });
  });
  // Canvas fontBoundingBox of the PAGE'S REAL stack at 400 100px — what
  // pdf-export.ts computeBaselineRatio's canvas FALLBACK would measure
  // (the per-style probe below is what the export actually uses).
  const c = document.createElement("canvas");
  const g = c.getContext("2d");
  g.font = "400 100px " + fontStack;
  const m = g.measureText("Hx");
  out.fontBox400 = {
    stack: fontStack,
    asc: m.fontBoundingBoxAscent,
    desc: m.fontBoundingBoxDescent,
  };
  // Per-style baseline anchor ratios, probed EXACTLY like pdf-export.ts
  // probeStyleRatios(): one off-screen line box per (weight, fs, strut)
  // taken from the rendered rows, baseline = empty inline-block bottom.
  // This is what the in-browser export resolves per style.
  const r2 = (n) => +n.toFixed(2);
  const probeKey = (weight, italic, fs, strut) =>
    `${italic ? "i" : ""}${weight}|${r2(fs)}|${r2(strut)}`;
  const probeTriples = new Map();
  for (const it of out.items) {
    const fs = parseFloat(it.fs);
    const strut = parseFloat(it.cssLH);
    const weight = parseInt(it.weight, 10) || 400;
    if (!Number.isFinite(fs) || !Number.isFinite(strut)) continue;
    probeTriples.set(probeKey(weight, it.italic, fs, strut), { weight, italic: it.italic, fs, strut });
  }
  // End-of-CV contact block (parity card 8): its rows live OUTSIDE the
  // content wrapper (bottom margin band), so they are never among the
  // walked items — but the exporter probes the (400, 12, 12) anchor
  // unconditionally. Probe it here too so a regenerated fixture carries
  // the key and --browser-metrics reproduces the contact baselines.
  probeTriples.set(probeKey(400, false, 12, 12), { weight: 400, italic: false, fs: 12, strut: 12 });
  const probeRatios = {};
  for (const [key, t] of probeTriples) {
    const d = document.createElement("div");
    d.style.cssText =
      `position:fixed;left:-99999px;top:0;white-space:nowrap;` +
      `font-family:${fontStack};font-weight:${t.weight};` +
      `${t.italic ? "font-style:italic;" : ""}` +
      `font-size:${t.fs}px;line-height:${t.strut}px;`;
    d.appendChild(document.createTextNode("Hx"));
    const s = document.createElement("span");
    s.style.cssText = "display:inline-block;width:0;height:0;";
    d.appendChild(s);
    document.body.appendChild(d);
    const O = s.getBoundingClientRect().bottom - d.getBoundingClientRect().top;
    d.remove();
    const ratio = (O - t.strut / 2) / t.fs;
    if (Number.isFinite(ratio)) probeRatios[key] = +ratio.toFixed(5);
  }
  out.probeRatios = probeRatios;
  // Hidden measure container height (cross-check against REPORT.md §5).
  const mc = [...document.querySelectorAll("div")].find((d) =>
    (d.getAttribute("style") || "").includes("9999px")
  );
  out.measureH = mc ? mc.firstElementChild.scrollHeight : null;

  console.log(
    "captured " +
      out.items.length +
      " items on " +
      out.pages +
      " page(s); fontBox400=" +
      JSON.stringify(out.fontBox400) +
      "; measureH=" +
      out.measureH +
      "; probeRatios=" +
      Object.keys(probeRatios).length +
      " styles"
  );
  console.log(JSON.stringify(out));
  if (typeof copy === "function") copy(out); // DevTools: JSON on your clipboard
  console.log(
    "Save the JSON as scripts/fixtures/preview-demo-boxes.json (fill in 'captured': the tree state), then run: node_modules/.bin/sucrase-node scripts/cv-row-parity.js"
  );
})();
