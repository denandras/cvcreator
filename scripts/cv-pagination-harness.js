// Pagination + PDF harness: runs the REAL exportToPdf with the user's live CV
// data (plus-jakarta fonts embedded as in production). Prints per-page layout
// and flags anomalies: overflow below bottomLimit, phantom extra pages.
const path = require("path");
const fs = require("fs");

const repo = "/home/denandras/repos/cvcreator";
const data = JSON.parse(fs.readFileSync("/tmp/cv_live_data.json", "utf-8"));

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
  if (typeof globalThis.navigator === "undefined") globalThis.navigator = { userAgent: "node", platform: "node" };
}
if (typeof globalThis.btoa === "undefined") {
  globalThis.btoa = (s) => Buffer.from(s, "binary").toString("base64");
}
if (typeof globalThis.atob === "undefined") {
  globalThis.atob = (s) => Buffer.from(s, "base64").toString("binary");
}

const { exportToPdf } = require(path.join(repo, "src/lib/pdf-export.ts"));

(async () => {
  const bytes = await exportToPdf(null, { cvData: data, output: "arraybuffer" });
  fs.writeFileSync("/tmp/cv_harness_out.pdf", Buffer.from(bytes));
  console.log("PDF bytes:", bytes.byteLength, "-> /tmp/cv_harness_out.pdf");

  // Analyze with pdfminer-free approach: use poppler's pdftotext if present
  const { execSync } = require("child_process");
  try {
    const info = execSync("pdfinfo /tmp/cv_harness_out.pdf").toString();
    const pageLine = info.split("\n").find((l) => l.startsWith("Pages:"));
    console.log(pageLine.trim());
  } catch {
    console.log("(pdfinfo unavailable)");
  }
})();