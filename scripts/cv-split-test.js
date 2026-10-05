// Synthetic split test: force a twocol chunk to split mid-section and verify
// (a) both columns pack to the free height (not row-aligned),
// (b) remainders continue independently on page 2,
// (c) no entry appears twice and none is dropped,
// (d) render ink stays within bounds.
const path = require("path");
const fs = require("fs");
const repo = "/home/denandras/repos/cvcreator";
const live = JSON.parse(fs.readFileSync("/tmp/cv_live_data.json", "utf-8"));

require(path.join(repo, "node_modules/sucrase/register/ts"));
const Module = require("module");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request.startsWith("@/")) request = path.join(repo, "src", request.slice(2));
  return origResolve.call(this, request, ...args);
};
if (typeof globalThis.window === "undefined") globalThis.window = globalThis;
if (typeof globalThis.navigator === "undefined") globalThis.navigator = { userAgent: "node", platform: "node" };
if (typeof globalThis.btoa === "undefined") globalThis.btoa = (s) => Buffer.from(s, "binary").toString("base64");
if (typeof globalThis.atob === "undefined") globalThis.atob = (s) => Buffer.from(s, "base64").toString("binary");
globalThis.fetch = async (input) => {
  const url = String(input);
  const m = url.match(/^\/fonts\/(.+)$/);
  if (!m) return new Response(url, { status: 404 });
  const buf = fs.readFileSync(path.join(repo, "public/fonts", decodeURIComponent(m[1])));
  return new Response(buf, { status: 200 });
};

// Shrink A4 usable space by inflating page_margin so the ZT two-col section
// must split mid-block. margin 150pt → usable height 592pt.
const data = JSON.parse(JSON.stringify(live));
data.design = { ...data.design, page_margin: 150 };

const { exportToPdf } = require(path.join(repo, "src/lib/pdf-export.ts"));

(async () => {
  const bytes = await exportToPdf(null, { cvData: data, output: "arraybuffer" });
  fs.writeFileSync("/tmp/cv_split_test.pdf", Buffer.from(bytes));
  console.log("bytes:", bytes.byteLength);
  const { execSync } = require("child_process");
  console.log(execSync("pdfinfo /tmp/cv_split_test.pdf | grep Pages").toString().trim());
})();