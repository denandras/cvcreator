/**
 * cv-row-parity.js — preview↔PDF row-parity GATE (REPORT.md §4 Step 7).
 *
 * WHAT IT DOES
 *   Exports the /demo CV through the REAL exportToPdf path under Node
 *   (sucrase transpile + @/ alias + fetch shim serving the embedded TTFs from
 *   public/fonts/cv — the same recipe as scripts/cv-filename-test.js /
 *   scripts/cv-keepnext-harness.js), then extracts every text line with
 *   poppler (`pdftotext -bbox`, one words XML per page) and compares the
 *   PDF's word-box tops against the preview's measured text-line tops with
 *   scripts/compare_rows.py. Exits 1 when max |Δy| > 1.5 px (TOL env of the
 *   comparator) or when page/row counts differ — the numeric gate that makes
 *   every future layout edit prove itself on BOTH renderers.
 *
 * THE PREVIEW SIDE IS AN INPUT FILE, NOT A BROWSER
 *   The gate never drives a browser. It takes the preview's measured rows as
 *   a boxes JSON (default scripts/fixtures/preview-demo-boxes.json, override
 *   with --boxes PATH). The file is produced by pasting the DevTools snippet
 *   scripts/capture-preview-boxes.js into the running app (dev server, demo
 *   state, fonts loaded) — see that file's header. Regenerate the fixture
 *   after intentional layout changes, then re-run the gate; stale fixtures
 *   fail loudly on page/row-count mismatches, by design.
 *
 * HOW TO RUN
 *   node_modules/.bin/sucrase-node scripts/cv-row-parity.js
 *        default run (BROWSER metrics — the production frame): fixture boxes
 *        vs a fresh export. Expected on the post-Steps-1-8 tree (2026-11-23):
 *        2 pages, 47/47 rows paired, max |Δy| ≈ 0.5 px, max |Δx| ≈ 0.01 px
 *        and max |Δ ink width| ≤ 1 % on every row — PASS, exit 0.
 *
 *   node_modules/.bin/sucrase-node scripts/cv-row-parity.js --node-metrics
 *        the deterministic Node fallback (no probed per-style anchors):
 *        same tree, max |Δy| ≈ 1.1 px — still PASS, but it is NOT the verdict;
 *        use it for bisecting only. Never let it stand in for the default run.
 *
 *   node_modules/.bin/sucrase-node scripts/cv-row-parity.js \
 *        --boxes .plan/cv-parity/baseline/preview-1-boxes.json
 *        the pre-fix capture: FAILS (exit 1) — the pre-fix preview rendered
 *        ONE clipped page (47 rows) while the fixed exporter produces 2
 *        pages (38+9 lines), so the gate reports the page/row-count
 *        violations plus ~30 per-row Δy violations of +2.0..+3.0 px.
 *
 *   node_modules/.bin/sucrase-node scripts/cv-row-parity.js --node-metrics
 *        INFORMATIONAL variant: reproduces the IN-BROWSER export's baseline
 *        placement under Node by feeding the fixture's captured probeRatios
 *        (per-style anchor ratios probed from the live DOM the same way
 *        pdf-export.ts probeStyleRatios() does at export time) through
 *        exportToPdf's baselineRatios hook. On the post-Step-8 tree this
 *        mode is the tightest run: the export places every baseline exactly
 *        where the browser's layout engine puts it, so the remaining Δy is
 *        only the comparator frame constant (poppler's word-box ascent vs
 *        the DOM Range-rect top). HISTORY: step 7 fed the fixture's
 *        fontBox400 (canvas metrics) through a canvas shim and measured the
 *        name row at +2.15 px — that residual was an ARTIFACT: the capture
 *        snippet had hardcoded 'Plus Jakarta Sans' while the demo CV
 *        renders Inter, so the run fed Inter rows PJS metrics. With the
 *        corrected fixture (real stack + probeRatios) the browser placement
 *        and the Node fallback agree to ~0.04 em-ratio on the demo.
 *
 * REQUIREMENTS
 *   poppler (pdfinfo + pdftotext) and python3 on PATH; no new npm
 *   dependencies (node builtins + the repo's existing jspdf/sucrase).
 *   pdftotext prints a harmless "Unknown character collection
 *   'Adobe-Identity-H'" warning to stderr for the subset fonts; the gate
 *   suppresses it — word extraction is complete (verified against the
 *   pre-fix baseline artifacts).
 *
 * Exit codes: 0 = parity within tolerance; 1 = parity violation (gate
 * tripped); 2 = harness error (export/poppler/comparator failure).
 */
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync, spawnSync } = require("child_process");

const repo = path.join(__dirname, "..");

// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
let boxesArg = path.join(repo, "scripts", "fixtures", "preview-demo-boxes.json");
// Production truth: the export runs in the BROWSER, which resolves per-style
// baseline anchors by probing the live DOM. That is the mode the gate guards
// and therefore the default. `--node-metrics` opts into the deterministic
// Node fallback (no probe map) — useful for bisecting, never the verdict.
let browserMetrics = true;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--boxes") {
    boxesArg = path.resolve(argv[++i]);
  } else if (argv[i] === "--browser-metrics") {
    browserMetrics = true;
  } else if (argv[i] === "--node-metrics") {
    browserMetrics = false;
  } else {
    console.error(`unknown argument: ${argv[i]}`);
    console.error(
      "usage: sucrase-node scripts/cv-row-parity.js [--boxes PREVIEW_BOXES.json] [--browser-metrics (default) | --node-metrics]"
    );
    process.exit(2);
  }
}

if (!fs.existsSync(boxesArg)) {
  console.error(`boxes file not found: ${boxesArg}`);
  process.exit(2);
}
const boxes = JSON.parse(fs.readFileSync(boxesArg, "utf-8"));

// ── Node harness plumbing (same contract as scripts/cv-keepnext-harness.js) ──
// Transpile .ts at require() time so the @/ alias patch below applies.
require(path.join(repo, "node_modules/sucrase/register/ts"));

// Register tsconfig paths (@/ -> src/) for require().
const Module = require("module");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request.startsWith("@/")) {
    request = path.join(repo, "src", request.slice(2));
  }
  return origResolve.call(this, request, ...args);
};

// jsPDF needs browser-ish globals at require time (AtobBtoa binds at import).
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

// --browser-metrics: reproduce the in-browser export's baseline placement.
// The browser resolves per-style baseline anchors by PROBING the live DOM
// (pdf-export.ts probeStyleRatios); under Node there is no DOM, so this mode
// feeds the fixture's captured probeRatios through exportToPdf's
// baselineRatios hook instead. The old canvas-metrics shim is gone — the
// canvas path is only a probe-failure fallback now, and step 7's shim fed
// the fixture's fontBox400, which had been measured against a HARDCODED
// Plus Jakarta stack while the demo renders Inter (bad residual).
if (browserMetrics) {
  const pr = boxes.probeRatios;
  if (!pr || typeof pr !== "object" || Object.keys(pr).length === 0) {
    console.error(
      "--browser-metrics: the boxes file carries no probeRatios — regenerate the fixture with the current scripts/capture-preview-boxes.js (it probes per-style anchors from the live DOM)"
    );
    process.exit(2);
  }
  console.log(
    `--browser-metrics: injecting ${Object.keys(pr).length} probed per-style anchor ratios: ` +
      Object.entries(pr)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")
  );
}

const { getDemoSections, getDemoDesign, getDemoProfile } = require(
  path.join(repo, "src/lib/demo-data.ts")
);
const { exportToPdf } = require(path.join(repo, "src/lib/pdf-export.ts"));

function fail(msg) {
  console.error(`cv-row-parity: harness error: ${msg}`);
  process.exit(2);
}

(async () => {
  console.log("== cv-row-parity: preview rows vs real exportToPdf output ==");
  console.log(`  boxes:      ${boxesArg}`);
  console.log(`  export:     real exportToPdf (sucrase-node, embedded TTFs,${browserMetrics ? " probed browser anchors (fixture probeRatios)" : " Node baseline-ratio fallback"})`);

  // 1. Export the demo CV through the real path.
  const demo = {
    profileName: getDemoProfile().name,
    profileTitle: getDemoProfile().title,
    profilePicture: null,
    sections: getDemoSections(),
    design: getDemoDesign(),
    activeLang: "hu",
  };
  const bytes = await exportToPdf(null, {
    cvData: demo,
    output: "arraybuffer",
    // --browser-metrics: the fixture's probed per-style anchors replace the
    // (empty under Node) probe map, reproducing the in-browser placement.
    ...(browserMetrics ? { baselineRatios: boxes.probeRatios } : {}),
  });

  // 2. Artifacts: fresh temp dir (kept; printed — inspect after a failure).
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cv-row-parity-"));
  const pdfPath = path.join(dir, "demo.pdf");
  fs.writeFileSync(pdfPath, Buffer.from(bytes));
  console.log(`  artifacts:  ${dir} (${bytes.byteLength} bytes PDF)`);

  // 3. poppler: page count + per-page word boxes.
  let pageCount;
  try {
    const info = execFileSync("pdfinfo", [pdfPath], { encoding: "utf-8" });
    pageCount = parseInt(
      (info.split("\n").find((l) => l.startsWith("Pages:")) || "").split(":")[1],
      10
    );
  } catch (e) {
    fail(`pdfinfo failed — is poppler installed? (${e.message})`);
  }
  if (!pageCount || Number.isNaN(pageCount)) fail("could not read page count from pdfinfo");
  console.log(`  pdf pages:  ${pageCount}`);

  const wordsFiles = [];
  for (let p = 1; p <= pageCount; p++) {
    const out = path.join(dir, `words-${p}.xml`);
    try {
      execFileSync("pdftotext", ["-bbox", "-f", String(p), "-l", String(p), pdfPath, out], {
        stdio: ["ignore", "ignore", "ignore"],
      });
    } catch (e) {
      fail(`pdftotext failed on page ${p}: ${e.message}`);
    }
    if (!fs.existsSync(out)) fail(`pdftotext produced no output for page ${p}`);
    wordsFiles.push(out);
  }

  // 4. The comparator owns the verdict (prints the per-row table).
  const cmp = path.join(repo, "scripts", "compare_rows.py");
  const res = spawnSync("python3", [cmp, boxesArg, ...wordsFiles], {
    stdio: "inherit",
  });
  if (res.error) fail(`could not run python3 scripts/compare_rows.py: ${res.error.message}`);

  const code = res.status === null ? 2 : res.status;
  console.log(
    `cv-row-parity: ${code === 0 ? "PASS" : code === 1 ? "FAIL — parity violation" : "ERROR"} (exit ${code}); artifacts in ${dir}`
  );
  process.exit(code);
})().catch((e) => {
  fail(e && (e.stack || e.message));
});
