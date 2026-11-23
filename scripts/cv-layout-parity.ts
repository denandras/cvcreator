/**
 * cv-layout-parity.ts — Step 6 acceptance harness (REPORT.md §4 Step 6).
 *
 * Proves the ONE shared flow-layout module (src/lib/cv-flow-layout.ts) models
 * the browser's real layout for the demo CV, using the exporter's own text
 * engine (jsPDF + the real embedded fonts from /public/fonts/cv):
 *
 *   1. Σ block heights + gaps == the browser content height (≤ 0.5 px);
 *   2. per-block flow tops == the browser's measured block tops (≤ 0.5 px);
 *   3. per-block ink boxes == the browser's measured boxes (≤ 0.5 px);
 *   4. paginate() splits the demo the way the browser renders it
 *      (2 pages, page 2 starts with the Projektek heading);
 *   5. placed tops == the RENDERED pages' measured tops (≤ 0.5 px), when the
 *      fixture carries a rendered-page capture.
 *
 * The browser side is a captured fixture, not a live browser:
 *   scripts/fixtures/layout-dom-demo.json — produced by auditing the /demo
 * page's hidden measure container (and the rendered page divs) via the
 * browser, at 1:1 CSS px, after document.fonts.ready, with localStorage
 * cleared. To regenerate:
 *
 *   1. npx next dev -p 3001   (any free port)
 *   2. open http://localhost:3001/demo, clear localStorage, reload, wait for
 *      fonts + the 2 rendered pages
 *   3. in DevTools, run the audit snippet from .plan/cv-parity/REPORT.md §5
 *      extended to also walk the rendered `div[style*="min-height: 1123px"]`
 *      pages — or reuse the capture from the Step 6 session notes — and
 *      write scripts/fixtures/layout-dom-demo.json
 *
 * Block matching is POSITIONAL (kind sequence + text labels are asserted):
 * the demo-data.ts id counter differs between the page process and this
 * fresh process, so ids cannot be compared — order and content can.
 *
 * Run: node_modules/.bin/sucrase-node scripts/cv-layout-parity.ts
 * Exit: 0 = parity within 0.5 px; 1 = any violation (numbers printed).
 */
import * as fs from "fs";
import * as path from "path";

const repo = path.join(__dirname, "..");

// ── Node harness plumbing (same contract as scripts/cv-keepnext-harness.js) ──
// jsPDF needs browser-ish globals at require time (AtobBtoa binds at import).
if (typeof globalThis.window === "undefined")
  (globalThis as unknown as { window: unknown }).window = globalThis;
if (typeof globalThis.navigator === "undefined")
  (globalThis as unknown as { navigator: unknown }).navigator = {
    userAgent: "node",
    platform: "node",
  };
if (typeof globalThis.btoa === "undefined")
  (globalThis as unknown as { btoa: (s: string) => string }).btoa = (s) =>
    Buffer.from(s, "binary").toString("base64");
if (typeof globalThis.atob === "undefined")
  (globalThis as unknown as { atob: (s: string) => string }).atob = (s) =>
    Buffer.from(s, "base64").toString("binary");

// Serve the real embedded fonts from public/ so measurement uses the real
// font metrics (wrap counts affect entry boxes and break decisions).
(globalThis as unknown as { fetch: unknown }).fetch = async (
  input: unknown
): Promise<Response> => {
  const url = String(input);
  const m = url.match(/^\/fonts\/(.+)$/);
  if (!m) return new Response(url, { status: 404 });
  const p = path.join(repo, "public/fonts", decodeURIComponent(m[1]));
  return new Response(fs.readFileSync(p), {
    status: 200,
    headers: { "content-type": "font/ttf" },
  });
};

// Register tsconfig paths (@/ -> src/) for require().
const Module = require("module") as {
  _resolveFilename: (request: string, ...args: unknown[]) => unknown;
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (
  this: typeof Module,
  request: string,
  ...args: unknown[]
) {
  if (request.startsWith("@/")) {
    request = path.join(repo, "src", request.slice(2));
  }
  return origResolve.call(this, request, ...args);
};

type FlowModule = typeof import("@/lib/cv-flow-layout");
type ExportModule = typeof import("@/lib/pdf-export");
type DemoModule = typeof import("@/lib/demo-data");
type JsPDFCtor = new (opts: unknown) => import("jspdf").jsPDF;

const jsPDFMod = require("jspdf") as { jsPDF: JsPDFCtor; default: JsPDFCtor };
const flow: FlowModule = require("@/lib/cv-flow-layout");
const exporter: ExportModule = require("@/lib/pdf-export");
const demo: DemoModule = require("@/lib/demo-data");

// ── types for the fixture ────────────────────────────────────────────────────
interface DomFixtureBlock {
  key: string;
  kind: string;
  sectionId: string | null;
  entryId?: string;
  label?: string;
  dom: { top: number; height: number; bottom: number };
}
interface DomFixture {
  source: string;
  captured: string;
  contentHeightPx: number;
  innerScrollHeight?: number;
  measureWidth: number;
  renderedPages: number;
  pageFirstHeadings?: string[];
  /** Optional: per rendered page, the measured content-relative tops/boxes. */
  rendered?: Array<{
    blocks: Array<{ key: string; kind: string; label?: string; top: number; height: number }>;
  }>;
  blocks: DomFixtureBlock[];
}

const TOL = 0.5;

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function entryLabel(entry: SectionWithEntriesEntry): string {
  const tr = entry.translations.find((t) => t.language === "hu");
  const title = flow.sanitizeFlowText(tr?.title ?? "");
  const organization = flow.sanitizeFlowText(tr?.organization ?? "");
  const description = flow.sanitizeFlowText(tr?.description ?? "");
  const yearText =
    ((entry.data as { year_text?: string } | undefined)?.year_text ?? "") ||
    (entry.year != null && entry.year !== 0 ? String(entry.year) : "");
  return collapse(
    [title, flow.sanitizeFlowText(yearText), organization, description]
      .filter(Boolean)
      .join("")
  );
}

type SectionWithEntriesEntry = import("@/types/database").SectionWithEntries["entries"][0];

async function main(): Promise<void> {
  const design = demo.getDemoDesign();
  const profile = demo.getDemoProfile();
  const sections = demo.getDemoSections();

  // The exporter's real text engine: fresh jsPDF doc, real fonts registered
  // from public/fonts/cv via the fetch shim, then the shared measure factory.
  const doc = new jsPDFMod.jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
    compress: true,
  });
  const setup = await exporter.setupPdfMeasure(doc, design);
  const measure = setup.makeMeasure("hu");

  const blocks = flow.computeFlowBlocks(sections, design, "hu", {
    profile: { name: profile.name, title: profile.title, hasPhoto: false },
    measure,
  });
  const contentH = flow.contentBoxHeightPx(design);
  const placed = flow.paginate(blocks, contentH);
  const pageCount =
    placed.length > 0 ? Math.max(...placed.map((p) => p.pageIndex)) + 1 : 1;

  // Flow tops (unsplit): Σ(height + gapAfter) up to each block.
  let sum = 0;
  const flowTops = blocks.map((b) => {
    const t = sum;
    sum += b.heightPx + b.gapAfterPx;
    return t;
  });

  const fixturePath = path.join(repo, "scripts/fixtures/layout-dom-demo.json");
  const fixture: DomFixture = JSON.parse(
    fs.readFileSync(fixturePath, "utf-8")
  ) as DomFixture;

  console.log("== cv-layout-parity: shared cv-flow-layout vs browser DOM ==");
  console.log(`fixture: ${fixturePath}`);
  console.log(`  captured: ${fixture.captured}`);
  console.log(
    `module: ${blocks.length} blocks, content box ${contentH} px, ` +
      `Σ(height+gap) ${sum.toFixed(3)} px`
  );
  console.log(
    `browser: ${fixture.blocks.length} blocks, content height ` +
      `${fixture.contentHeightPx} px (measure width ${fixture.measureWidth} px)`
  );

  const violations: string[] = [];

  // The module's block list also carries sectionTail blocks (pure gaps —
  // no DOM element, but they advance the flow). Pair the INK blocks with the
  // fixture's measured elements in order; tails are skipped by the cursor
  // but still contribute to flowTops below.
  const inkBlocks = blocks.filter((b) => b.kind !== "sectionTail");

  // ── shape: ink-block kind sequence must match ─────────────────────────────
  if (inkBlocks.length !== fixture.blocks.length) {
    violations.push(
      `ink block count: module ${inkBlocks.length} vs browser ${fixture.blocks.length}`
    );
  }
  const n = Math.min(inkBlocks.length, fixture.blocks.length);
  for (let i = 0; i < n; i++) {
    if (inkBlocks[i].kind !== fixture.blocks[i].kind) {
      violations.push(
        `block ${i} kind: module ${inkBlocks[i].key}/${inkBlocks[i].kind} vs ` +
          `browser ${fixture.blocks[i].key}/${fixture.blocks[i].kind}`
      );
    }
  }

  // ── labels: same CV, same order ───────────────────────────────────────────
  for (let i = 0; i < n; i++) {
    const b = inkBlocks[i];
    const fx = fixture.blocks[i];
    let label = "";
    if (b.kind === "header") label = collapse(profile.name + profile.title);
    else if (b.kind === "heading") label = collapse(b.title ?? "");
    else if (b.kind === "entry" && b.entry) label = entryLabel(b.entry);
    else if (b.kind === "twocolChunk") continue; // demo has no twocol sections
    else continue;
    if ((fx.label ?? "").slice(0, 40) !== label.slice(0, 40)) {
      violations.push(
        `block ${i} label: module "${label.slice(0, 40)}" vs browser ` +
          `"${(fx.label ?? "").slice(0, 40)}"`
      );
    }
  }

  // ── per-block tops and boxes vs the measured tree ─────────────────────────
  console.log("\n  idx kind         planTop   domTop     Δtop   planBox   domBox     Δbox");
  let maxTop = 0;
  let maxBox = 0;
  const flowTopOf = new Map<unknown, number>();
  blocks.forEach((b, i) => flowTopOf.set(b, flowTops[i]));
  for (let i = 0; i < n; i++) {
    const b = inkBlocks[i];
    const fx = fixture.blocks[i];
    const planTop = flowTopOf.get(b) ?? 0;
    const dTop = planTop - fx.dom.top;
    const dBox = b.heightPx - fx.dom.height;
    maxTop = Math.max(maxTop, Math.abs(dTop));
    maxBox = Math.max(maxBox, Math.abs(dBox));
    const flag =
      Math.abs(dTop) > TOL || Math.abs(dBox) > TOL ? "  <-- VIOLATION" : "";
    console.log(
      `  ${String(i).padStart(3)} ${b.kind.padEnd(12)} ` +
        `${planTop.toFixed(3).padStart(8)} ${fx.dom.top.toFixed(3).padStart(8)} ` +
        `${dTop >= 0 ? "+" : ""}${dTop.toFixed(3).padStart(7)} ` +
        `${b.heightPx.toFixed(3).padStart(8)} ${fx.dom.height.toFixed(3).padStart(8)} ` +
        `${dBox >= 0 ? "+" : ""}${dBox.toFixed(3).padStart(7)}${flag}`
    );
    if (Math.abs(dTop) > TOL) {
      violations.push(
        `block ${i} (${b.key}) top: plan ${planTop.toFixed(3)} vs DOM ` +
          `${fx.dom.top.toFixed(3)} (Δ${dTop.toFixed(3)}px)`
      );
    }
    if (Math.abs(dBox) > TOL) {
      violations.push(
        `block ${i} (${b.key}) box: plan ${b.heightPx.toFixed(3)} vs DOM ` +
          `${fx.dom.height.toFixed(3)} (Δ${dBox.toFixed(3)}px)`
      );
    }
  }

  // ── Σ block heights + gaps == browser content height ───────────────────────
  const dContent = sum - fixture.contentHeightPx;
  console.log(
    `\n  Σ(height+gapAfter) = ${sum.toFixed(3)} px  vs browser content height ` +
      `${fixture.contentHeightPx} px  Δ = ${dContent >= 0 ? "+" : ""}${dContent.toFixed(3)} px` +
      (Math.abs(dContent) > TOL ? "  <-- VIOLATION" : "")
  );
  if (Math.abs(dContent) > TOL) {
    violations.push(
      `content height: Σ ${sum.toFixed(3)} vs browser ${fixture.contentHeightPx} ` +
        `(Δ${dContent.toFixed(3)}px)`
    );
  }
  console.log(
    `  max |Δtop| = ${maxTop.toFixed(3)} px, max |Δbox| = ${maxBox.toFixed(3)} px (tolerance ${TOL})`
  );

  // ── paginate(): page count and split ──────────────────────────────────────
  console.log(`\n  paginate(): ${pageCount} pages (browser rendered ${fixture.renderedPages})`);
  for (let page = 0; page < pageCount; page++) {
    const onPage = placed.filter((p) => p.pageIndex === page);
    const first = onPage[0];
    const last = onPage[onPage.length - 1];
    const firstTitle =
      first && first.block.kind === "heading" ? first.block.title : "(no heading)";
    console.log(
      `    page ${page + 1}: ${onPage.length} placed, ` +
        `first=${first ? first.block.key : "-"} (${firstTitle ?? "-"}), ` +
        `last=${last ? last.block.key : "-"}`
    );
  }
  if (pageCount !== fixture.renderedPages) {
    violations.push(
      `page count: plan ${pageCount} vs browser ${fixture.renderedPages}`
    );
  }
  const page2FirstHeading = placed.find(
    (p) => p.pageIndex === 1 && p.block.kind === "heading"
  );
  const expectP2 = (fixture.pageFirstHeadings ?? [])[1] ?? "Projektek";
  if (pageCount === 2) {
    if (page2FirstHeading?.block.title !== expectP2) {
      violations.push(
        `page 2 first heading: plan "${page2FirstHeading?.block.title ?? "?"}" ` +
          `vs browser "${expectP2}"`
      );
    }
  }

  // ── placed tops vs the rendered pages (when the fixture carries them) ─────
  if (fixture.rendered && fixture.rendered.length > 0) {
    console.log("\n  placed topPx vs rendered page DOM (content-relative):");
    let maxPlaced = 0;
    for (let page = 0; page < Math.min(pageCount, fixture.rendered.length); page++) {
      const rendered = fixture.rendered[page].blocks;
      const onPage = placed.filter(
        (p) =>
          p.pageIndex === page &&
          p.block.kind !== "sectionTail" &&
          p.block.kind !== "header"
      );
      const m = Math.min(onPage.length, rendered.length);
      for (let i = 0; i < m; i++) {
        const d = onPage[i].topPx - rendered[i].top;
        maxPlaced = Math.max(maxPlaced, Math.abs(d));
        const flag = Math.abs(d) > TOL ? "  <-- VIOLATION" : "";
        console.log(
          `    page ${page + 1} [${i}] ${onPage[i].block.key.padEnd(22)} ` +
            `plan ${onPage[i].topPx.toFixed(3)} vs rendered ${rendered[i].top.toFixed(3)} ` +
            `Δ${d >= 0 ? "+" : ""}${d.toFixed(3)}${flag}`
        );
        if (Math.abs(d) > TOL) {
          violations.push(
            `placed top page ${page + 1} [${onPage[i].block.key}]: plan ` +
              `${onPage[i].topPx.toFixed(3)} vs rendered ${rendered[i].top.toFixed(3)} ` +
              `(Δ${d.toFixed(3)}px)`
          );
        }
      }
    }
    console.log(`    max |Δplaced-top| = ${maxPlaced.toFixed(3)} px`);
  } else {
    console.log("\n  (fixture has no rendered-page capture — skipped placed-top check)");
  }

  // ── verdict ───────────────────────────────────────────────────────────────
  if (violations.length > 0) {
    console.error(`\nFAIL: ${violations.length} violation(s):`);
    for (const v of violations) console.error(`  - ${v}`);
    process.exitCode = 1;
  } else {
    console.log(
      `\nPASS: Σ heights + paginate tops match the browser DOM within ${TOL} px ` +
        `(max |Δtop| ${maxTop.toFixed(3)}, max |Δbox| ${maxBox.toFixed(3)}, ` +
        `content Δ${dContent.toFixed(3)}, ${pageCount} pages)`
    );
    process.exitCode = 0;
  }
}

main().catch((e: unknown) => {
  console.error("parity script error:", e);
  process.exitCode = 2;
});
