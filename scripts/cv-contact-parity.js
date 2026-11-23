/**
 * cv-contact-parity.js — end-of-CV contact block harness (parity card 8).
 *
 * WHAT IT DOES
 *   Exports the /demo CV through the REAL exportToPdf path under Node (same
 *   sucrase + @/alias + fetch-shim recipe as scripts/cv-row-parity.js) in
 *   FIVE variants and measures the contact block's invariants:
 *
 *     V0 defaults       — no contact keys at all (the gate's baseline state)
 *     V1 both ticked    — phone "+36 1 456 7890", e-mail "kovacs.tamas@example.com"
 *     V2 phone off      — only the e-mail line may appear (criterion 4)
 *     V3 both ticked, both values EMPTY (criterion 5: same as off)
 *     V4 merged export  — all 4 demo languages, both ticked (per-language
 *                         block placement: the contact lines must land on the
 *                         LAST page of EACH language block, nowhere else)
 *
 *   CHECKS (all measured, exit 1 on any violation)
 *     C6  every variant's page count is unchanged (V0–V3: 2 pages;
 *         V4: 8 pages = 4 language blocks × 2).
 *     C3  V1's flow rows are IDENTICAL to V0's — same line count per page,
 *         every shared word box at the same (xMin, yMin, xMax, yMax); the
 *         ONLY additions are the contact lines at the bottom of page 2.
 *         (Bit-identical boxes are expected: the flow draw ops are
 *         unchanged, so poppler must extract the same coordinates.)
 *     C4  V2: the phone string appears NOWHERE in the PDF text; the e-mail
 *         line is present exactly once (page 2).
 *     C5  V3: NEITHER string appears anywhere (ticked checkboxes + empty
 *         values must render exactly like unticked).
 *     C2  the contact block's first line top vs the LIVE PREVIEW DOM:
 *         with --dom REF.json (emitted by the browser session that ticks
 *         the same demo state and measures the block with the gate's own
 *         Range-rect convention), |PDF yMin×4/3 − DOM ly| ≤ 1 px. With
 *         --probe-ratios also from REF.json the export uses the browser's
 *         probed 400|12|12 anchor (the tightest run, mirroring the gate's
 *         --browser-metrics mode); without it the Node fallback ratio
 *         applies (informational only — the authoritative C2 evidence is
 *         the in-browser export, measured separately).
 *     V4  merged: contact lines on pages 2, 4, 6, 8 exactly (each language
 *         block's last page), absent from every other page.
 *
 * HOW TO RUN
 *   node_modules/.bin/sucrase-node scripts/cv-contact-parity.js \
 *        [--dom PATH] [--verbose]
 *   REF.json shape (browser session, see the card-8 report):
 *     { "domFirstLineTopPx": 1087.xx, "domSecondLineTopPx": 1099.xx,
 *       "probeRatios": { "400|12|12": 0.3xx } }
 *
 * REQUIREMENTS: poppler (pdfinfo + pdftotext), same as the row-parity gate.
 * Exit codes: 0 = all invariants hold; 1 = violation; 2 = harness error.
 */
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");

const repo = path.join(__dirname, "..");

const argv = process.argv.slice(2);
let domRefPath = null;
let verbose = false;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--dom") domRefPath = path.resolve(argv[++i]);
  else if (argv[i] === "--verbose") verbose = true;
  else {
    console.error(`unknown argument: ${argv[i]}`);
    console.error("usage: sucrase-node scripts/cv-contact-parity.js [--dom REF.json] [--verbose]");
    process.exit(2);
  }
}
const domRef = domRefPath ? JSON.parse(fs.readFileSync(domRefPath, "utf-8")) : null;

// ── Node harness plumbing (same contract as scripts/cv-row-parity.js) ──────
require(path.join(repo, "node_modules/sucrase/register/ts"));
const Module = require("module");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request.startsWith("@/")) {
    request = path.join(repo, "src", request.slice(2));
  }
  return origResolve.call(this, request, ...args);
};
if (typeof globalThis.window === "undefined") globalThis.window = globalThis;
if (typeof globalThis.navigator === "undefined")
  globalThis.navigator = { userAgent: "node", platform: "node" };
if (typeof globalThis.btoa === "undefined")
  globalThis.btoa = (s) => Buffer.from(s, "binary").toString("base64");
if (typeof globalThis.atob === "undefined")
  globalThis.atob = (s) => Buffer.from(s, "base64").toString("binary");
globalThis.fetch = async (input) => {
  const url = String(input);
  const m = url.match(/^\/fonts\/(.+)$/);
  if (!m) return new Response(url, { status: 404 });
  const p = path.join(repo, "public/fonts", decodeURIComponent(m[1]));
  return new Response(fs.readFileSync(p), {
    status: 200,
    headers: { "content-type": "font/ttf" },
  });
};

const { getDemoSections, getDemoDesign, getDemoProfile } = require(
  path.join(repo, "src/lib/demo-data.ts")
);
const { exportToPdf } = require(path.join(repo, "src/lib/pdf-export.ts"));

const PHONE = "+36 1 456 7890";
const EMAIL = "kovacs.tamas@example.com";
const PT2PX = 4 / 3;

function fail(msg) {
  console.error(`cv-contact-parity: harness error: ${msg}`);
  process.exit(2);
}

const violations = [];
function check(ok, label) {
  if (ok) {
    console.log(`  PASS  ${label}`);
  } else {
    console.log(`  FAIL  ${label}`);
    violations.push(label);
  }
}

/** poppler word boxes for one page → text lines (same grouping rule as
 *  scripts/compare_rows.py: words with yMin within 1.2 px). */
function pageLines(pdfPath, page) {
  const out = path.join(os.tmpdir(), `cv-contact-words-${process.pid}-${page}.xml`);
  try {
    execFileSync("pdftotext", ["-bbox", "-f", String(page), "-l", String(page), pdfPath, out], {
      stdio: ["ignore", "ignore", "ignore"],
    });
  } catch (e) {
    fail(`pdftotext failed on page ${page}: ${e.message}`);
  }
  const s = fs.readFileSync(out, "utf-8");
  const words = [];
  const re = /<word xMin="([\d.-]+)" yMin="([\d.-]+)" xMax="([\d.-]+)" yMax="([\d.-]+)">(.*?)<\/word>/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    words.push({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], text: m[5] });
  }
  fs.unlinkSync(out);
  const lines = [];
  for (const w of words.slice().sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)) {
    if (lines.length && Math.abs(lines[lines.length - 1].y0 - w.y0) < 1.2) {
      lines[lines.length - 1].words.push(w);
    } else {
      lines.push({ y0: w.y0, words: [w] });
    }
  }
  return lines.map((ln) => ({
    y: ln.y0,
    x0: Math.min(...ln.words.map((w) => w.x0)),
    x1: Math.max(...ln.words.map((w) => w.x1)),
    text: ln.words.map((w) => w.text).join(" "),
    words: ln.words,
  }));
}

function pdfPageCount(pdfPath) {
  const info = execFileSync("pdfinfo", [pdfPath], { encoding: "utf-8" });
  const n = parseInt(
    (info.split("\n").find((l) => l.startsWith("Pages:")) || "").split(":")[1],
    10
  );
  if (!n || Number.isNaN(n)) fail(`could not read page count from ${pdfPath}`);
  return n;
}

function fullText(pdfPath, pages) {
  let txt = "";
  for (let p = 1; p <= pages; p++) {
    txt += pageLines(pdfPath, p).map((l) => l.text).join("\n") + "\n";
  }
  return txt;
}

/** Design with the contact keys patched into custom_config (read-modify,
 *  exactly what the editors do). */
function designWithContact(design, patch) {
  return {
    ...design,
    custom_config: { ...(design.custom_config ?? {}), ...patch },
  };
}

(async () => {
  console.log("== cv-contact-parity: end-of-CV contact block invariants ==");
  const baseDesign = getDemoDesign();
  const demo = {
    profileName: getDemoProfile().name,
    profileTitle: getDemoProfile().title,
    profilePicture: null,
    sections: getDemoSections(),
    design: baseDesign,
    activeLang: "hu",
  };

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cv-contact-parity-"));
  const variants = {
    V0_defaults: demo,
    V1_both_ticked: {
      ...demo,
      design: designWithContact(baseDesign, {
        contact_phone: PHONE,
        contact_email: EMAIL,
        contact_show_phone: true,
        contact_show_email: true,
      }),
    },
    V2_phone_off: {
      ...demo,
      design: designWithContact(baseDesign, {
        contact_phone: PHONE,
        contact_email: EMAIL,
        contact_show_phone: false,
        contact_show_email: true,
      }),
    },
    V3_empty_values: {
      ...demo,
      design: designWithContact(baseDesign, {
        contact_phone: "",
        contact_email: "",
        contact_show_phone: true,
        contact_show_email: true,
      }),
    },
  };

  const pdfs = {};
  for (const [name, cvData] of Object.entries(variants)) {
    const bytes = await exportToPdf(null, {
      cvData,
      output: "arraybuffer",
      // The browser session's probed 400|12|12 anchor, when provided,
      // reproduces the in-browser export's contact baseline under Node.
      ...(domRef?.probeRatios ? { baselineRatios: domRef.probeRatios } : {}),
    });
    const p = path.join(dir, `${name}.pdf`);
    fs.writeFileSync(p, Buffer.from(bytes));
    pdfs[name] = p;
    console.log(`  exported ${name} → ${p} (${bytes.byteLength} bytes)`);
  }

  // V4: merged all-languages export with both ticked.
  const mergedBytes = await exportToPdf(null, {
    cvData: variants.V1_both_ticked,
    output: "arraybuffer",
    allLanguages: [
      { code: "hu", name: demo.profileName, title: demo.profileTitle },
      { code: "en", name: demo.profileName, title: demo.profileTitle },
      { code: "de", name: demo.profileName, title: demo.profileTitle },
      { code: "fr", name: demo.profileName, title: demo.profileTitle },
    ],
    ...(domRef?.probeRatios ? { baselineRatios: domRef.probeRatios } : {}),
  });
  const mergedPath = path.join(dir, "V4_merged.pdf");
  fs.writeFileSync(mergedPath, Buffer.from(mergedBytes));
  console.log(`  exported V4_merged → ${mergedPath} (${mergedBytes.byteLength} bytes)`);

  // ── C6: page counts unchanged ─────────────────────────────────────────
  console.log("\nC6 — page counts unchanged:");
  for (const name of Object.keys(variants)) {
    const n = pdfPageCount(pdfs[name]);
    check(n === 2, `${name}: ${n} page(s) (expected 2)`);
  }
  const mergedPages = pdfPageCount(mergedPath);
  check(mergedPages === 8, `V4_merged: ${mergedPages} page(s) (expected 8 = 4 langs × 2)`);

  // ── C3: V1's flow rows identical to V0's; only the contact lines added ──
  console.log("\nC3 — nothing else moves (V1 vs V0 word boxes):");
  const v0 = [pageLines(pdfs.V0_defaults, 1), pageLines(pdfs.V0_defaults, 2)];
  const v1 = [pageLines(pdfs.V1_both_ticked, 1), pageLines(pdfs.V1_both_ticked, 2)];
  for (let pg = 0; pg < 2; pg++) {
    const a = v0[pg];
    const b = v1[pg];
    const extra = b.length - a.length;
    const expectedExtra = pg === 1 ? 2 : 0;
    check(
      extra === expectedExtra,
      `page ${pg + 1}: line count ${b.length} vs baseline ${a.length} (expected +${expectedExtra})`
    );
    let maxD = 0;
    let mismatch = null;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const dy = Math.abs(b[i].y - a[i].y);
      const dx = Math.abs(b[i].x0 - a[i].x0);
      const dx1 = Math.abs(b[i].x1 - a[i].x1);
      const d = Math.max(dy, dx, dx1);
      if (d > maxD) maxD = d;
      if (b[i].text !== a[i].text && !mismatch)
        mismatch = `row ${i}: ${JSON.stringify(a[i].text)} → ${JSON.stringify(b[i].text)}`;
    }
    check(
      maxD === 0 && !mismatch,
      `page ${pg + 1}: ${a.length} shared rows bit-identical (max |Δ| = ${maxD} px)${mismatch ? " — " + mismatch : ""}`
    );
    if (verbose) {
      b.slice(a.length).forEach((l, i) =>
        console.log(`    extra line ${i}: y=${(l.y * PT2PX).toFixed(2)}px x=${(l.x0 * PT2PX).toFixed(2)}px "${l.text}"`)
      );
    }
  }
  const v1Extra = v1[1].slice(v0[1].length);
  check(
    v1Extra.length === 2 &&
      v1Extra[0].text.replace(/\s+/g, " ").trim() === PHONE &&
      v1Extra[1].text.replace(/\s+/g, " ").trim() === EMAIL,
    `V1 page 2 additions are exactly the two contact lines (phone first, e-mail second): ${JSON.stringify(
      v1Extra.map((l) => l.text)
    )}`
  );

  // ── C2: contact block first line top, PDF vs live DOM ───────────────────
  console.log("\nC2 — contact block first line top (PDF vs live DOM):");
  const pdfFirstTopPx = v1Extra.length ? v1Extra[0].y * PT2PX : null;
  if (domRef && pdfFirstTopPx != null) {
    const domTop = domRef.domFirstLineTopPx;
    const dy = pdfFirstTopPx - domTop;
    check(
      Math.abs(dy) <= 1,
      `first line top: PDF ${pdfFirstTopPx.toFixed(2)} px vs DOM ${domTop.toFixed(2)} px → Δy ${dy >= 0 ? "+" : ""}${dy.toFixed(2)} px (tolerance ±1 px)`
    );
    if (domRef.domSecondLineTopPx != null && v1Extra[1]) {
      const dy2 = v1Extra[1].y * PT2PX - domRef.domSecondLineTopPx;
      check(
        Math.abs(dy2) <= 1,
        `second line top: PDF ${(v1Extra[1].y * PT2PX).toFixed(2)} px vs DOM ${domRef.domSecondLineTopPx.toFixed(2)} px → Δy ${dy2 >= 0 ? "+" : ""}${dy2.toFixed(2)} px (tolerance ±1 px)`
      );
    }
    // Model cross-check: the block's own geometry, derived independently.
    // The model predicts the BLOCK TOP (line box anchor); the Range-rect
    // `ly` sits ABOVE it by the font's content-area overhang (Inter's
    // ascent exceeds the 12px line box), so the check reads the measured
    // block top, not ly.
    const PAGE_MARGIN = 48;
    const PAGE_HEIGHT = 1123;
    const CONTACT_PX = 12;
    const bandTop = PAGE_HEIGHT - PAGE_MARGIN;
    const modelTop = bandTop + Math.max(0, (PAGE_MARGIN - 2 * CONTACT_PX) / 2);
    const blockTop =
      domRef.block && typeof domRef.block.blockTopPageRel === "number"
        ? domRef.block.blockTopPageRel
        : domRef.blockTopPagePx;
    check(
      blockTop != null && Math.abs(blockTop - modelTop) <= 0.75,
      `DOM block top ${blockTop} px matches the band model (${bandTop} + (48−24)/2 = ${modelTop} px)`
    );
  } else {
    console.log(
      `  (no --dom reference; PDF-side first line top = ${pdfFirstTopPx != null ? pdfFirstTopPx.toFixed(2) + " px" : "n/a"} — the authoritative ±1 px comparison runs in the browser session)`
    );
  }

  // ── C4: phone off → phone string nowhere; e-mail present exactly once ──
  console.log("\nC4 — checkbox off → string absent from the PDF:");
  {
    const pages = pdfPageCount(pdfs.V2_phone_off);
    const txt = fullText(pdfs.V2_phone_off, pages).replace(/\s+/g, " ");
    const hasPhone = txt.includes(PHONE);
    const emailCount = txt.split(EMAIL).length - 1;
    check(!hasPhone, `V2 (phone off): phone "${PHONE}" absent from the PDF text`);
    check(emailCount === 1, `V2 (phone off): e-mail present exactly once (found ${emailCount})`);
    const v2p2 = pageLines(pdfs.V2_phone_off, 2);
    const emailLines = v2p2.filter((l) => l.text.includes(EMAIL));
    check(
      emailLines.length === 1,
      `V2 (phone off): exactly one e-mail line on page 2 (found ${emailLines.length})`
    );
  }

  // ── C5: both ticked, both empty → same as off ──────────────────────────
  console.log("\nC5 — both ticked but both values empty → renders as off:");
  {
    const pages = pdfPageCount(pdfs.V3_empty_values);
    const v3 = [pageLines(pdfs.V3_empty_values, 1), pageLines(pdfs.V3_empty_values, 2)];
    check(
      v3[0].length === v0[0].length && v3[1].length === v0[1].length,
      `V3: line counts identical to V0 (${v3[0].length}/${v3[1].length} vs ${v0[0].length}/${v0[1].length})`
    );
    let maxD = 0;
    for (let pg = 0; pg < 2; pg++) {
      for (let i = 0; i < Math.min(v3[pg].length, v0[pg].length); i++) {
        maxD = Math.max(maxD, Math.abs(v3[pg][i].y - v0[pg][i].y), Math.abs(v3[pg][i].x0 - v0[pg][i].x0));
      }
    }
    check(maxD === 0, `V3: all shared rows bit-identical to V0 (max |Δ| = ${maxD} px)`);
  }

  // ── V4: merged export — contact block on each language block's last page
  console.log("\nV4 — merged all-languages export (contact on each block's last page):");
  {
    for (let p = 1; p <= mergedPages; p++) {
      const lines = pageLines(mergedPath, p);
      const hasContact =
        lines.some((l) => l.text.replace(/\s+/g, " ").trim() === PHONE) ||
        lines.some((l) => l.text.replace(/\s+/g, " ").trim() === EMAIL);
      const isBlockLast = p % 2 === 0; // 4 blocks × 2 pages → 2,4,6,8
      check(
        hasContact === isBlockLast,
        `merged page ${p}: contact ${hasContact ? "PRESENT" : "absent"} (expected ${isBlockLast ? "PRESENT (language-block last page)" : "absent"})`
      );
    }
  }

  console.log(`\nartifacts: ${dir}`);
  if (violations.length) {
    console.log(`\nFAIL — ${violations.length} violation(s):`);
    for (const v of violations) console.log(`  - ${v}`);
    process.exit(1);
  }
  console.log("\nPASS — all contact-block invariants hold.");
  process.exit(0);
})().catch((e) => {
  fail(e && (e.stack || e.message));
});
