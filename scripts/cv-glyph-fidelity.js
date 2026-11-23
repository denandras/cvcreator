// Fidelity harness for a single style: compare what the exporter THINKS it
// wrote with what a reader actually gets back from the PDF.
//
//   input : the exact strings the caller passed (including every language
//           translation of every entry, the heading, and the contact lines)
//   output : pdftotext of the exported PDF
//   check  : every character that appears in the input must appear in the
//           output (multiset compare per codepoint, after collapsing
//           whitespace) — jsPDF silently drops text runs whose glyph
//           lookups fail their internal guard, and that shows up here.
//
// Run: node_modules/.bin/sucrase-node scripts/cv-glyph-fidelity.js [fontId] [--template clean|modern|creative|minimalist]
const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");

const repo = "/home/denandras/repos/cvcreator";
const fontId = process.argv[2] || "inter";
const tplIdx = process.argv.indexOf("--template");
const template = tplIdx > -1 ? process.argv[tplIdx + 1] : null;
const outDir = "/home/denandras/.hermes/cache/scratch/cv-glyphs";
fs.mkdirSync(outDir, { recursive: true });

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

// Every European letter family a CV could plausibly contain.
const SAMPLE = {
  hu: "Árvíztűrő tükörfúrógép — Őrült Űrhajós, öt szűz őzike űz.",
  de: "Grüße aus München — die Straße, das Maß, groß, Fußball, ÄÖÜ äöü ß.",
  ro: "Știm șiruri, țară, Țigănești, București — ă â î ș ț Ă Â Î Ș Ț.",
  tr: "Iğdır, ılık, şeker, çiçek, öğüt, üstün — Ğ İ Ş Ç Ö Ü ğ ı ş ç ö ü.",
  pl: "Zażółć gęślą jaźń — ąćęłńóśźż ĄĆĘŁŃÓŚŹŻ.",
  cs: "Příliš žluťoučký kůň úpěl ďábelské ódy — čďěňřšťůž ČĎĚŇŘŠŤŮŽ.",
  da: "Ærø, Århus, smørrebrød — å æ ø Å Æ Ø.",
};

(async () => {
  const { getDemoSections, getDemoDesign } = require(path.join(repo, "src/lib/demo-data.ts"));
  const { exportToPdf } = require(path.join(repo, "src/lib/pdf-export.ts"));

  const design = { ...getDemoDesign(), font_family: fontId };
  if (template) design.template = template;

  // Put every sample line into the CV: the title carries all of them, and the
  // first entry's hu description carries them again (wrap + two lines paths).
  const allLines = Object.values(SAMPLE);
  const sections = getDemoSections();
  const firstSection = sections[0];
  firstSection.entries = firstSection.entries.slice(0, 1).map((e) => ({
    ...e,
    data: { ...e.data, year_text: "2019—2021" },
    translations: (e.translations || []).map((t) => ({
      ...t,
      description: `${t.description || ""} ${allLines.join(" ")}`,
    })),
  }));
  sections.length = 1;

  const input = [
    "Őrült Űrhajós Árvíztűrő Tükörfúrógép",
    allLines.join(" "),
    firstSection.title,
    ...firstSection.entries.flatMap((e) => (e.translations || []).map((t) => `${t.title || ""} ${t.organization || ""} ${t.description || ""}`)),
  ].join(" ");

  const bytes = await exportToPdf(null, {
    cvData: {
      profileName: "Őrült Űrhajós Árvíztűrő Tükörfúrógép",
      profileTitle: allLines.join(" "),
      profilePicture: null,
      sections,
      design,
      activeLang: "hu",
    },
    output: "arraybuffer",
  });
  const tag = `${fontId}${template ? "-" + template : ""}`;
  const pdf = path.join(outDir, `fidelity-${tag}.pdf`);
  fs.writeFileSync(pdf, Buffer.from(bytes));
  const out = execFileSync("pdftotext", ["-layout", pdf, "-"], { encoding: "utf-8" });
  if (process.env.DUMP) console.log(out.slice(0, 1500));

  // Multiset compare per codepoint, ignoring whitespace and the characters the
  // renderer legitimately rewrites (bullets/pipes for separators, uppercasing
  // is per-character so case counts stay comparable).
  const norm = (s, upper) => {
    const m = new Map();
    for (const ch of s.replace(/\s+/g, "").toUpperCase()) m.set(ch, (m.get(ch) || 0) + 1);
    return m;
  };
  const want = norm(input, true);
  const have = norm(out, true);
  const missing = [];
  for (const [ch, n] of want) {
    const got = have.get(ch) || 0;
    if (got < n) missing.push(`${ch}(x${n - got})`);
  }
  console.log(`font=${fontId} template=${template || "default"} pdf=${path}`);
  console.log(`input chars=${input.length} output chars=${out.length} distinct codepoints=${want.size}`);
  const head = out.split("\n").filter((l) => l.trim()).slice(0, 3);
  head.forEach((l) => console.log(`  | ${l.trim().slice(0, 150)}`));
  console.log(missing.length ? `LOST IN PDF: ${missing.join(" ")}` : "LOST IN PDF: none");
  process.exit(missing.length ? 1 : 0);
})().catch((e) => {
  console.error("FAIL:", e && (e.stack || e.message));
  process.exit(2);
});
