// Keep-with-next acceptance harness (card 2/7 — REPORT §4 Step 3).
//
// Runs the REAL exportToPdf (jsPDF + embedded fonts, no DOM) over the demo
// CV (rebuilt from src/lib/demo-data.ts — same builders the app uses) and
// every fixture in scripts/fixtures/keepnext-*.json, hooks jsPDF's
// text/addPage to record every text draw per page, and asserts the Step-3
// invariant:
//
//     NO PAGE'S LAST FLOW ITEM IS A HEADING.
//
// A heading is always drawn as text, and a page's last flow item being a
// heading means the LAST text drawn on that page is that heading (the
// renderer draws sections strictly in flow order; heading decorations are
// not text). So: FAIL when any page's last text draw equals one of the
// enabled sections' rendered titles (uppercased by renderHeading), except
// the unavoidable document-end case — the LAST page ending with the final
// section's heading when that section has no enabled entries.
//
// Also asserts the demo CV's split (acceptance 2, exporter side):
// page 1 = Tapasztalat…Díjak ending with the Elismerés line, page 2 starts
// with PROJEKTEK, and page 1 does not contain PROJEKTEK.
//
// Prints per-fixture per-page evidence and exits 1 on any violation.
//
// Run: node_modules/.bin/sucrase-node scripts/cv-keepnext-harness.js
const path = require("path");
const fs = require("fs");

const repo = path.join(__dirname, "..");

// Transpile .ts/.tsx to CJS at require() time so the alias patch applies
require(path.join(repo, "node_modules/sucrase/register/ts"));

// Register tsconfig paths (@/ -> src/) for require()
const Module = require("module");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request.startsWith("@/")) {
    request = path.join(repo, "src", request.slice(2));
  }
  return origResolve.call(this, request, ...args);
};

// jsPDF needs browser-ish globals at require time
if (typeof globalThis.window === "undefined") globalThis.window = globalThis;
if (typeof globalThis.navigator === "undefined")
  globalThis.navigator = { userAgent: "node", platform: "node" };
if (typeof globalThis.btoa === "undefined")
  globalThis.btoa = (s) => Buffer.from(s, "binary").toString("base64");
if (typeof globalThis.atob === "undefined")
  globalThis.atob = (s) => Buffer.from(s, "base64").toString("binary");

// Serve the real embedded fonts from public/ so measurement uses the real
// font metrics (wrap counts affect entry heights and break decisions).
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

const jsPDFMod = require("jspdf");
const OrigJsPDF = jsPDFMod.jsPDF;

// Text-draw recorder: wraps the jsPDF constructor so every export records
// (page, text) in draw order.
function makeRecorder() {
  const rec = { pages: [], page: 1 };
  rec.pages.push([]);
  function WrappedJsPDF(opts) {
    const doc = new OrigJsPDF(opts);
    const origAddPage = doc.addPage.bind(doc);
    const origText = doc.text.bind(doc);
    doc.addPage = (...args) => {
      rec.page += 1;
      rec.pages.push([]);
      return origAddPage(...args);
    };
    doc.text = (text, x, y, opts2) => {
      const s = Array.isArray(text) ? text.join(" ") : String(text);
      const pageArr = rec.pages[Math.min(rec.page, rec.pages.length - 1)];
      pageArr.push(s.trim());
      return origText(text, x, y, opts2);
    };
    return doc;
  }
  WrappedJsPDF.prototype = OrigJsPDF.prototype;
  rec.WrappedJsPDF = WrappedJsPDF;
  return rec;
}

const { exportToPdf } = require(path.join(repo, "src/lib/pdf-export.ts"));

// Rendered heading text for a section, mirroring renderSection +
// renderHeading: translated title (layout_config.sectionTitleTranslations
// [activeLang]) wins when non-empty, otherwise the section title; uppercased.
function renderedHeadingTitle(section, activeLang) {
  const titleMap = (section.layout_config || {}).sectionTitleTranslations;
  const t =
    (titleMap && titleMap[activeLang]) || String(section.title || "").trim();
  return t.trim().toUpperCase();
}

function sanitize(text) {
  return String(text)
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function runCv(label, cv) {
  const rec = makeRecorder();
  // pdf-export.ts does `import jsPDF from "jspdf"` — the DEFAULT export is
  // the constructor the code instantiates, so that binding is what must be
  // wrapped (jsPDFMod.jsPDF alone is not read by the compiled import).
  jsPDFMod.default = rec.WrappedJsPDF;
  jsPDFMod.jsPDF = rec.WrappedJsPDF;
  const bytes = await exportToPdf(null, { cvData: cv, output: "arraybuffer" });
  jsPDFMod.default = OrigJsPDF;
  jsPDFMod.jsPDF = OrigJsPDF;

  const activeLang = cv.activeLang;
  const enabled = cv.sections.filter((s) => s.is_enabled);
  const headingInfo = new Map(); // rendered heading text -> meta
  enabled.forEach((s, idx) => {
    const entries = (s.entries || []).filter((e) => e.is_enabled);
    headingInfo.set(renderedHeadingTitle(s, activeLang), {
      idx,
      entries: entries.length,
      isLast: idx === enabled.length - 1,
    });
  });

  const violations = [];
  const lastPage = rec.pages.length;
  rec.pages.forEach((texts, pi) => {
    const page = pi + 1;
    const nonEmpty = texts.filter((t) => t.length > 0);
    const first = nonEmpty[0] || "(no text)";
    const last = nonEmpty[nonEmpty.length - 1] || "(no text)";
    let orphan = null;
    if (headingInfo.has(last)) {
      const info = headingInfo.get(last);
      const documentEndException =
        page === lastPage && info.isLast && info.entries === 0;
      if (!documentEndException) {
        orphan = { page, heading: last, exception: documentEndException };
      }
    }
    if (orphan) violations.push(orphan);
    console.log(
      `    page ${page}: first="${first.slice(0, 60)}" last="${last.slice(0, 60)}"` +
        (orphan ? "  <-- PAGE ENDS WITH A HEADING" : "")
    );
  });

  let extra = "";
  if (label === "demo") {
    // Acceptance 2 (exporter side): same split as today's PDF.
    const p1 = rec.pages[0] || [];
    const p2 = rec.pages[1] || [];
    const p1HasProjektek = p1.some((t) => t === "PROJEKTEK");
    const p1Last = (p1.filter((t) => t.length > 0).slice(-1)[0] || "");
    const p2First = (p2.filter((t) => t.length > 0)[0] || "");
    const splitOk =
      rec.pages.length === 2 &&
      !p1HasProjektek &&
      p1Last.startsWith("Elismerés a Városháza") &&
      p2First === "PROJEKTEK";
    extra = ` | split=${splitOk ? "OK (p1=Tapasztalat…Díjak, p2=PROJEKTEK…)" : "UNEXPECTED"}`;
    if (!splitOk) violations.push({ page: "?", heading: "demo split changed" });
  }

  const ok = violations.length === 0;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}: pages=${rec.pages.length} bytes=${bytes.byteLength}${extra}`
  );
  for (const v of violations) {
    console.log(
      `      violation: page ${v.page} ends with heading "${v.heading}"`
    );
  }
  return ok;
}

(async () => {
  // The demo CV, rebuilt from the same builders the app uses — also kept in
  // /tmp/cv_live_data.json for the pre-existing harnesses.
  const demo = {
    profileName: getDemoProfile().name,
    profileTitle: getDemoProfile().title,
    profilePicture: null,
    sections: getDemoSections(),
    design: getDemoDesign(),
    activeLang: "hu",
  };
  fs.writeFileSync("/tmp/cv_live_data.json", JSON.stringify(demo));

  const fixtureDir = path.join(repo, "scripts/fixtures");
  const fixtureFiles = fs
    .readdirSync(fixtureDir)
    .filter((f) => f.startsWith("keepnext-") && f.endsWith(".json"))
    .sort();

  const results = [];
  console.log("== Keep-with-next assertion over the REAL export path ==");
  console.log(`-- demo CV (src/lib/demo-data.ts) --`);
  results.push(await runCv("demo", demo));
  for (const f of fixtureFiles) {
    const cv = JSON.parse(fs.readFileSync(path.join(fixtureDir, f), "utf-8"));
    console.log(`-- ${f} --`);
    results.push(await runCv(f.replace(/\.json$/, ""), cv));
  }

  const failed = results.filter((r) => !r).length;
  console.log(
    `\nRESULT: ${results.length - failed}/${results.length} passed` +
      (failed ? ` — ${failed} FAILED (pages ending with a heading)` : " — no page ends with a heading")
  );
  process.exitCode = failed ? 1 : 0;
})().catch((e) => {
  console.error("harness error:", e);
  process.exitCode = 2;
});
