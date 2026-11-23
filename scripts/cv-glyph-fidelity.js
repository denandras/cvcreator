/**
 * cv-glyph-fidelity.js — character-fidelity GATE through the REAL export
 * path (card t_a8f48654). Run in CI; it must fail the build whenever the
 * exported PDF loses text.
 *
 * WHAT IT PROVES
 *   Every character the CV data asks for reaches the exported PDF, and every
 *   character the exporter draws survives a real readback. It catches the
 *   "PDF drops extended-Latin characters" class of bug END TO END: jsPDF
 *   cmap gaps, serialization truncation, off-page ink (the exporter used to
 *   draw the profile title as ONE unbounded centred run whose tail ran past
 *   the A4 MediaBox — poppler, like every printer, silently drops ink
 *   outside the page; the fix wraps the header like the preview does), and
 *   any future renderer change that loses text.
 *
 * HOW — two honest levels per cell, both MULTISET per codepoint (a missing
 * character COUNT, not just a missing codepoint), whitespace collapsed and
 * case-folded (the exporter uppercases the title/headings; "ß" folds to
 * "SS" on both sides of the compare):
 *
 *   LEVEL 1 — COVERAGE (data ⊆ drawn): a jsPDF subclass records every string
 *   handed to doc.text. Every character of the ACTIVE-language content
 *   (profile name/title, section titles, entries' active-language
 *   title/organization/description + year text, the contact lines when
 *   enabled) must appear in what was drawn. NON-active translations are
 *   deliberately not counted — the exporter renders one language per
 *   document by design. Without this level a renderer that quietly skips
 *   content would still pass a drawn-vs-readback-only check.
 *
 *   LEVEL 2 — FIDELITY (drawn ⊆ readback): pdftotext of the exported PDF
 *   must return every drawn character. Drawn-but-not-read characters are
 *   ink a real reader cannot see — off-page, clipped, or dropped by the
 *   serializer. This is the level the original 894/2600 report tripped.
 *
 * MATRIX: fonts inter, lora, crimson (the embedded TTFs of public/fonts/cv)
 *   × templates clean, modern, creative, minimalist.
 *   No args → all 12 cells. `<fontId>` → that font × 4 templates.
 *   `--template X` → 3 fonts × that template. Both → one cell.
 *   Exit 0 ONLY when every cell passes BOTH levels. Each cell prints its
 *   two kept/sent counts. DUMP=1 prints the pdftotext text of the first
 *   failing cell.
 *
 * RUN
 *   node_modules/.bin/sucrase-node scripts/cv-glyph-fidelity.js [fontId] [--template X]
 *   (also works under plain node — no TypeScript imports outside src/)
 *
 * Exit codes: 0 = gate green; 1 = fidelity/coverage violation; 2 = harness
 * error (export/poppler failure).
 */
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");

const repo = path.join(__dirname, "..");

// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const FONTS = ["inter", "lora", "crimson"];
const TEMPLATES = ["clean", "modern", "creative", "minimalist"];
const tplIdx = argv.indexOf("--template");
const templateArg = tplIdx > -1 ? argv[tplIdx + 1] : null;
const fontArgIdx = argv.findIndex((a) => !a.startsWith("--"));
const fontArg = fontArgIdx > -1 ? argv[fontArgIdx] : null;
const fonts = fontArg ? [fontArg] : FONTS;
const templates = templateArg ? [templateArg] : TEMPLATES;

// ── Node shims for the browser-side export path (same recipe as
// scripts/cv-row-parity.js): @/ alias + fetch serving the embedded TTFs
// from public/fonts/cv — the same bytes the preview loads via fonts.css.
const Module = require("module");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (r, ...a) {
  if (r.startsWith("@/")) r = path.join(repo, "src", r.slice(2));
  return origResolve.call(this, r, ...a);
};
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => {
  if (typeof u === "string" && u.startsWith("/fonts/cv/")) {
    try {
      const d = fs.readFileSync(path.join(repo, "public", u));
      const b = d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength);
      return { ok: true, status: 200, arrayBuffer: async () => b };
    } catch {
      return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    }
  }
  return realFetch(u, o);
};

// ── Level 1 spy: record every string handed to doc.text ─────────────────────
// jsPDF's constructor copies every API method onto the instance as an OWN
// property, so a prototype-level override is silently clobbered — the spy
// must re-wrap this.text AFTER super(). Patched into the module cache
// BEFORE pdf-export is required (pdf-export's `import jsPDF from "jspdf"`
// reads the .default export at require time).
let drawn = [];
const jspdfMod = require(path.join(repo, "node_modules/jspdf/dist/jspdf.node.min.js"));
const RealJsPDF = jspdfMod.jsPDF;
class SpyJsPDF extends RealJsPDF {
  constructor(...args) {
    super(...args);
    const orig = this.text.bind(this);
    this.text = (t, ...rest) => {
      drawn.push(Array.isArray(t) ? t.join("\n") : String(t));
      return orig(t, ...rest);
    };
  }
}
jspdfMod.default = SpyJsPDF;
jspdfMod.jsPDF = SpyJsPDF;

// ── The extended-Latin sample: every European letter family a CV could
// plausibly contain (same lines the repro uses).
const SAMPLE = [
  "Árvíztűrő tükörfúrógép — Őrült Űrhajós, öt szűz őzike űz.",
  "Grüße aus München — die Straße, das Maß, groß, Fußball, ÄÖÜ äöü ß.",
  "Știm șiruri, țară, Țigănești, București — ă â î ș ț Ă Â Î Ș Ț.",
  "Iğdır, ılık, şeker, çiçek, öğüt, üstün — Ğ İ Ş Ç Ö Ü ğ ı ş ç ö ü.",
  "Zażółć gęślą jaźń — ąćęłńóśźż ĄĆĘŁŃÓŚŹŻ.",
  "Příliš žluťoučký kůň úpěl ďábelské ódy — čďěňřšťůž ČĎĚŇŘŠŤŮŽ.",
  "Ærø, Århus, smørrebrød — å æ ø Å Æ Ø.",
].join(" ");

// Multiset per codepoint (whitespace collapsed, case-folded).
function multiset(s) {
  const m = new Map();
  for (const ch of s.replace(/\s+/g, "").toUpperCase()) m.set(ch, (m.get(ch) || 0) + 1);
  return m;
}

/** want ⊆ have (multiset): returns [coveredCount, totalCount, missingList]. */
function coverage(want, have) {
  let kept = 0;
  let total = 0;
  const missing = [];
  for (const [ch, n] of want) {
    const got = Math.min(have.get(ch) || 0, n);
    kept += got;
    total += n;
    if (got < n) missing.push(`${ch} U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}x${n - got}`);
  }
  return [kept, total, missing];
}

(async () => {
  const { getDemoSections, getDemoDesign } = require(path.join(repo, "src/lib/demo-data.ts"));
  const { exportToPdf } = require(path.join(repo, "src/lib/pdf-export.ts"));
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "cv-glyph-fidelity-"));
  const activeLang = "hu";
  let failures = 0;
  let dumped = false;

  for (const font of fonts) {
    for (const template of templates) {
      const tag = `${font}/${template}`;
      // Fresh demo data per cell: the monster title (every sample line) and
      // the first entry's ACTIVE-language description carrying the samples
      // again — the two paths that used to lose characters.
      const design = { ...getDemoDesign(), font_family: font, template };
      const sections = getDemoSections();
      const first = sections[0];
      first.entries = first.entries.slice(0, 1).map((e) => ({
        ...e,
        data: { ...e.data, year_text: "2019—2021" },
        translations: (e.translations || []).map((t) =>
          t.language === activeLang
            ? { ...t, description: `${t.description || ""} ${SAMPLE}` }
            : t
        ),
      }));
      sections.length = 1;

      const profileName = "Őrült Űrhajós Árvíztűrő Tükörfúrógép";
      const profileTitle = SAMPLE;
      const cvData = {
        profileName,
        profileTitle,
        profilePicture: null,
        sections,
        design,
        activeLang,
      };

      // Level 1 expected set — the ACTIVE-language content the exporter is
      // supposed to draw (mirrors renderProfileHeader / renderHeading /
      // renderEntry's translation resolution and the contact-line reader).
      const cfg = (design.custom_config ?? {});
      const expectedParts = [profileName, profileTitle];
      for (const section of sections) {
        const titleMap =
          (section.layout_config || {}).sectionTitleTranslations || null;
        expectedParts.push((titleMap && titleMap[activeLang]) || section.title || "");
        for (const entry of section.entries) {
          const t = (entry.translations || []).find((x) => x.language === activeLang);
          expectedParts.push(t ? t.title || "" : "", t ? t.organization || "" : "", t ? t.description || "" : "");
          expectedParts.push(
            (((entry.data || {}).year_text ?? "") || "") ||
              (entry.year != null && entry.year !== 0 ? String(entry.year) : "")
          );
        }
      }
      if (cfg.contact_show_phone === true && cfg.contact_phone) expectedParts.push(cfg.contact_phone);
      if (cfg.contact_show_email === true && cfg.contact_email) expectedParts.push(cfg.contact_email);

      drawn = [];
      const bytes = await exportToPdf(null, { cvData, output: "arraybuffer" });
      const pdf = path.join(outDir, `fidelity-${font}-${template}.pdf`);
      fs.writeFileSync(pdf, Buffer.from(bytes));
      const out = execFileSync("pdftotext", ["-layout", pdf, "-"], {
        encoding: "utf-8",
        stderr: "ignore",
      });

      const [cov, covTotal, covMissing] = coverage(
        multiset(expectedParts.join(" ")),
        multiset(drawn.join("\n"))
      );
      const [fid, fidTotal, fidMissing] = coverage(multiset(drawn.join("\n")), multiset(out));

      const ok = covMissing.length === 0 && fidMissing.length === 0;
      const mark = ok ? "PASS" : "FAIL";
      console.log(
        `[${tag}] ${mark}  L1 coverage ${cov}/${covTotal} chars drawn (${((100 * cov) / Math.max(1, covTotal)).toFixed(1)}%)  |  L2 fidelity ${fid}/${fidTotal} drawn chars read back (${((100 * fid) / Math.max(1, fidTotal)).toFixed(1)}%)  pdf=${pdf}`
      );
      if (covMissing.length)
        console.log(`    L1 MISSING IN DRAW: ${covMissing.join(" ")}`);
      if (fidMissing.length)
        console.log(`    L2 LOST IN PDF: ${fidMissing.join(" ")}`);
      if (!ok) {
        failures++;
        if (process.env.DUMP && !dumped) {
          dumped = true;
          console.log("---- pdftotext output ----");
          console.log(out.slice(0, 2000));
        }
      }
    }
  }

  if (failures) {
    console.log(`\ncv-glyph-fidelity: ${failures} cell(s) FAILED — characters lost between data, draw and readback.`);
    process.exit(1);
  }
  console.log(`\ncv-glyph-fidelity: PASS — every cell kept 100% of its characters on both levels.`);
  process.exit(0);
})().catch((e) => {
  console.error("HARNESS ERROR:", e && (e.stack || e.message));
  process.exit(2);
});
