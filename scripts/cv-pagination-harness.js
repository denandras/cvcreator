// Pagination + PDF harness: runs the REAL exportToPdf with the user's live CV
// data (plus-jakarta fonts embedded as in production). Prints per-page layout
// and flags anomalies: overflow below bottomLimit, phantom extra pages.
const path = require("path");
const fs = require("fs");

const repo = "/home/denandras/repos/cvcreator";
const data = JSON.parse(fs.readFileSync("/tmp/cv_live_data.json", "utf-8"));

// Transpile .ts/.tsx to CJS at require() time so the alias patch below applies
// to the transformed require() calls (plain node treats .ts as ESM and uses its
// own resolver, which can't see the @/ paths).
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

// jsPDF needs browser-ish globals at require time (AtobBtoa binds at import)
if (typeof globalThis.window === "undefined") {
  globalThis.window = globalThis;
}
if (typeof globalThis.navigator === "undefined") {
  globalThis.navigator = { userAgent: "node", platform: "node" };
}
if (typeof globalThis.btoa === "undefined") {
  globalThis.btoa = (s) => Buffer.from(s, "binary").toString("base64");
}
if (typeof globalThis.atob === "undefined") {
  globalThis.atob = (s) => Buffer.from(s, "base64").toString("binary");
}
// Node 18+ has global fetch, but relative '/fonts/...' URLs need a base —
// point it at the static public/ dir so the real embed path is exercised.
if (typeof globalThis.fetch === "undefined" || true) {
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const m = url.match(/^\/fonts\/(.+)$/);
    if (!m) return new Response(url, { status: 404 });
    const p = path.join(repo, "public/fonts", decodeURIComponent(m[1]));
    const buf = fs.readFileSync(p);
    return new Response(buf, { status: 200, headers: { "content-type": "font/ttf" } });
  };
}

const { exportToPdf } = require(path.join(repo, "src/lib/pdf-export.ts"));

(async () => {
  const bytes = await exportToPdf(null, { cvData: data, output: "arraybuffer" });
  fs.writeFileSync("/tmp/cv_harness_out.pdf", Buffer.from(bytes));
  console.log("PDF bytes:", bytes.byteLength, "-> /tmp/cv_harness_out.pdf");

  const { execSync } = require("child_process");
  try {
    const info = execSync("pdfinfo /tmp/cv_harness_out.pdf").toString();
    const pageLine = info.split("\n").find((l) => l.startsWith("Pages:"));
    console.log(pageLine.trim());
  } catch {
    console.log("(pdfinfo unavailable)");
  }
})();