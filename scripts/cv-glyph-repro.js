/**
 * cv-glyph-repro.js — minimal standalone repro of the extended-Latin
 * character loss in the exported PDF (card t_a8f48654).
 *
 * WHAT IT MEASURES (per case: ONE jsPDF doc, ONE embedded TTF from
 * public/fonts/cv, ONE logical draw — no app imports):
 *
 *   1. jsPDF's own cmap + serialization: per-character glyph lookup through
 *      the font object jsPDF parsed (characterToGlyph) and the hex string
 *      pdfEscape16 produces (4 hex digits per character; pdfEscape16 returns
 *      EARLY at the first glyph-0 lookup, which is what silent truncation
 *      would look like).
 *   2. The PDF content stream: every stream is inflated and the show-text
 *      hex payloads inside BT..ET are counted — ground truth for what is
 *      physically in the file.
 *   3. poppler readback: pdftotext output vs the sent string, MULTISET per
 *      codepoint (whitespace collapsed, case-folded) + the longest common
 *      prefix (where the readback first diverges).
 *
 * CASES
 *   fit      the 7-language sample + " ZZZQ" as ONE doc.text() at 3 pt,
 *            left-aligned: a ~400-character run mixing every extended-Latin
 *            family, fully INSIDE the page. This is the honest test of
 *            jsPDF's serialization: if characters are lost here, jsPDF is
 *            dropping them. GATING.
 *   wrapped  the exporter's POST-FIX profile-title shape: splitTextToSize at
 *            the content width (charSpace-aware) then one centred doc.text()
 *            per line at the per-line strut advance — the geometry
 *            renderProfileHeader uses after the fix. GATING.
 *   legacy   the exporter's PRE-FIX profile-title shape: ONE unbounded
 *            centred doc.text() (10.5 pt, charSpace 1.4, uppercase). Its ink
 *            extends past both page edges and poppler — like every real
 *            printer — does not read text outside the MediaBox, so the tail
 *            is lost. NOT gating: it documents the mechanism this card
 *            fixes in the exporter, and stays lossy by construction.
 *
 * RUN
 *   node scripts/cv-glyph-repro.js [fontId] [--jspdf <path/to/jspdf.dist.js>]
 *   (runs under plain node and sucrase-node alike; --jspdf points this SAME
 *   measurement at other jsPDF versions for the bisect table)
 *
 * Exit 0 iff every gating case keeps 100% of its characters (multiset, tail
 * marker included).
 */
const path = require("path");
const fs = require("fs");
const zlib = require("zlib");
const os = require("os");
const { execFileSync } = require("child_process");

const repo = path.join(__dirname, "..");

const argv = process.argv.slice(2);
const fontIdIdx = argv.findIndex((a) => !a.startsWith("--"));
const fontId = fontIdIdx > -1 ? argv[fontIdIdx] : "inter";
const jspdfIdx = argv.indexOf("--jspdf");
const jspdfDist =
  jspdfIdx > -1 ? argv[jspdfIdx + 1] : path.join(repo, "node_modules/jspdf/dist/jspdf.node.min.js");

const { jsPDF } = require(jspdfDist);
const b64 = fs.readFileSync(path.join(repo, "public/fonts/cv", `${fontId}-400.ttf`)).toString("base64");
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "cv-glyph-repro-"));

// The same 7-language sample the fidelity harness pushes through the real
// export path — every extended-Latin family a European CV can contain.
const SAMPLE = [
  "Árvíztűrő tükörfúrógép — Őrült Űrhajós, öt szűz őzike űz.",
  "Grüße aus München — die Straße, das Maß, groß, Fußball, ÄÖÜ äöü ß.",
  "Știm șiruri, țară, Țigănești, București — ă â î ș ț Ă Â Î Ș Ț.",
  "Iğdır, ılık, şeker, çiçek, öğüt, üstün — Ğ İ Ş Ç Ö Ü ğ ı ş ç ö ü.",
  "Zażółć gęślą jaźń — ąćęłńóśźż ĄĆĘŁŃÓŚŹŻ.",
  "Příliš žluťoučký kůň úpěl ďábelské ódy — čďěňřšťůž ČĎĚŇŘŠŤŮŽ.",
  "Ærø, Århus, smørrebrød — å æ ø Å Æ Ø.",
].join(" ");
const TAIL = "ZZZQ";

const PAGE_W = 595.28; // A4 pt — the exporter's page
const MARGIN = 36; // 48 px page margin @0.75
const CONTENT_W = PAGE_W - 2 * MARGIN;

function newDoc() {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.addFileToVFS("f.ttf", b64);
  doc.addFont("f.ttf", "TestFam", "normal");
  doc.setFont("TestFam", "normal");
  return doc;
}

// jsPDF's own view of the font on a THROWAWAY doc: which characters map to
// glyph 0 in its cmap parse, and what pdfEscape16 serializes for the string.
function probeJspdf(text) {
  const doc = newDoc();
  const font = doc.internal.getFont();
  const zeroGlyph = [];
  for (let i = 0; i < text.length; i++) {
    const g = font.metadata.characterToGlyph(text.charCodeAt(i));
    if (g === 0) zeroGlyph.push({ index: i, ch: text[i], cp: text.charCodeAt(i) });
  }
  const escaped = jsPDF.API.pdfEscape16 ? jsPDF.API.pdfEscape16(text, font) : null;
  return {
    zeroGlyph,
    hexLen: escaped == null ? -1 : escaped.length,
    expectedHex: text.length * 4,
  };
}

// Inflate every stream and count hex glyphs inside show-text operators —
// what the PDF physically contains, independent of jsPDF and poppler.
function hexInContentStreams(buf) {
  const latin = buf.toString("latin1");
  let hexDigits = 0;
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(latin))) {
    const start = m.index + m[0].length;
    const end = latin.indexOf("endstream", start);
    if (end === -1) break;
    let content = null;
    try {
      content = zlib.inflateSync(buf.slice(start, end)).toString("latin1");
    } catch (e) {
      content = latin.slice(start, end); // uncompressed streams
    }
    if (!content.includes("BT")) {
      re.lastIndex = end;
      continue;
    }
    for (const h of content.match(/<([0-9A-Fa-f]*)>/g) || []) hexDigits += h.length - 2;
    re.lastIndex = end;
  }
  return hexDigits / 4; // 4 hex digits per 2-byte CID glyph
}

// Multiset per codepoint (whitespace collapsed, case-folded).
function multiset(s) {
  const m = new Map();
  for (const ch of s.replace(/\s+/g, "").toUpperCase()) m.set(ch, (m.get(ch) || 0) + 1);
  return m;
}

function runCase(label, text, draw, gating) {
  // 1. what jsPDF itself serializes
  const probe = probeJspdf(text);

  // 2. the actual draw on a fresh doc + what lands in the file
  const doc = newDoc();
  draw(doc, text);
  const pdfPath = path.join(outDir, `repro-${label}.pdf`);
  fs.writeFileSync(pdfPath, Buffer.from(doc.output("arraybuffer")));
  const buf = fs.readFileSync(pdfPath);
  const streamGlyphs = hexInContentStreams(buf);

  // 3. what a reader gets back
  const out = execFileSync("pdftotext", ["-layout", pdfPath, "-"], {
    encoding: "utf-8",
    stderr: "ignore",
  });
  const want = multiset(text);
  const have = multiset(out);
  let kept = 0;
  const lost = [];
  for (const [ch, n] of want) {
    const got = Math.min(have.get(ch) || 0, n);
    kept += got;
    if (got < n)
      lost.push(`${ch} U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}x${n - got}`);
  }
  const flatIn = text.replace(/\s+/g, "").toUpperCase();
  const flatOut = out.replace(/\s+/g, "").toUpperCase();
  let prefix = 0;
  while (prefix < flatIn.length && flatIn[prefix] === flatOut[prefix]) prefix++;

  const sent = flatIn.length; // multiset total after case-folding (ß → SS …)
  const cut = probe.zeroGlyph.length
    ? `first glyph-0 at index ${probe.zeroGlyph[0].index} = "${probe.zeroGlyph[0].ch}"`
    : "none";
  console.log(
    `case ${label.padEnd(7)} sent=${sent} kept=${kept} (${((100 * kept) / sent).toFixed(1)}%) tail=${flatOut.includes(TAIL) ? "present" : "MISSING"}${gating ? "" : "  [non-gating: mechanism demo]"}`
  );
  console.log(
    `          jspdf cmap: ${probe.zeroGlyph.length} glyph-0 chars (${cut}); pdfEscape16 hex=${probe.hexLen}/${probe.expectedHex}; content stream ${streamGlyphs}/${text.length} glyph slots; readback diverges at flat char ${prefix}/${flatIn.length}`
  );
  if (lost.length) console.log(`          LOST (${lost.length} distinct): ${lost.join(" ")}`);
  return lost.length === 0;
}

console.log(`jspdf dist: ${jspdfDist}`);
console.log(`font: public/fonts/cv/${fontId}-400.ttf   artifacts: ${outDir}/repro-*.pdf\n`);

let ok = true;

// fit: ~400-char mixed run, fully on-page, ONE call — the honest test of
// jsPDF's serialization of long mixed-class text. 2 pt: the full sample is
// ~400 pt wide, well inside the 523 pt of printable width.
ok =
  runCase(
    "fit",
    `${SAMPLE} ${TAIL}`,
    (doc, text) => {
      doc.setFontSize(2);
      doc.text(text, MARGIN, 40);
    },
    true
  ) && ok;

// wrapped: the exporter's POST-FIX title shape — a word wrap budgeted for
// the tracking the draw spends (jsPDF's getStringUnitWidth adds charSpace
// per glyph — splitTextToSize DROPS the charSpace option for embedded TTFs,
// which is how a naive split overflows the page), then one centred
// doc.text() per line at the per-line strut advance.
ok =
  runCase(
    "wrapped",
    `${SAMPLE.toUpperCase()} ${TAIL}`,
    (doc, text) => {
      const fsPt = 10.5;
      const charSpace = 1.05; // 0.1em × 10.5pt
      const width = (s) => doc.getStringUnitWidth(s, { charSpace });
      const maxUnits = CONTENT_W / fsPt;
      const words = text.split(/\s+/).filter(Boolean);
      const lines = [];
      let cur = "";
      for (const word of words) {
        const candidate = cur ? `${cur} ${word}` : word;
        if (!cur || width(candidate) <= maxUnits) cur = candidate;
        else {
          lines.push(cur);
          cur = word;
        }
      }
      if (cur) lines.push(cur);
      doc.setFontSize(fsPt);
      for (let i = 0; i < lines.length; i++) {
        doc.text(lines[i], MARGIN + CONTENT_W / 2, 60 + i * 15.75, { align: "center", charSpace });
      }
    },
    true
  ) && ok;

// legacy: the exporter's PRE-FIX title shape — ONE unbounded centred call.
// The ink extends past both MediaBox edges; poppler does not read text
// outside the MediaBox, so everything beyond the page edge is lost to every
// real reader. Documents the bug this card fixes; lossy by construction.
runCase(
  "legacy",
  `${SAMPLE.toUpperCase()} ${TAIL}`,
  (doc, text) => {
    doc.setFontSize(10.5);
    doc.text(text, MARGIN + CONTENT_W / 2, 60, { align: "center", charSpace: 1.4 });
  },
  false
);

console.log(
  ok
    ? "\nPASS: every gating case kept 100% of its characters."
    : "\nFAIL: at least one gating case lost characters — see LOST lines above."
);
process.exit(ok ? 0 : 1);
