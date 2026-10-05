// E2E: education entries with data.year_text ranges render the range text
// right-aligned in the PDF, and pagination stays within bounds.
const path = require("path");
const fs = require("fs");
const repo = "/home/denandras/repos/cvcreator";
const live = JSON.parse(fs.readFileSync("/tmp/cv_live_data.json", "utf-8"));

require(path.join(repo, "node_modules/sucrase/register/ts"));
const Module = require("module");
Module._resolveFilename = (function (orig) {
  return function (request, ...args) {
    if (request.startsWith("@/")) request = path.join(repo, "src", request.slice(2));
    return orig.call(this, request, ...args);
  };
})(Module._resolveFilename);
if (typeof globalThis.window === "undefined") globalThis.window = globalThis;
globalThis.navigator = { userAgent: "node", platform: "node" };
globalThis.btoa = (s) => Buffer.from(s, "binary").toString("base64");
globalThis.atob = (s) => Buffer.from(s, "base64").toString("binary");
globalThis.fetch = async (input) => {
  const m = String(input).match(/^\/fonts\/(.+)$/);
  if (!m) return new Response(String(input), { status: 404 });
  return new Response(fs.readFileSync(path.join(repo, "public/fonts", decodeURIComponent(m[1]))), { status: 200 });
};

const { exportToPdf } = require(path.join(repo, "src/lib/pdf-export.ts"));

(async () => {
  const data = JSON.parse(JSON.stringify(live));
  // Education entries: put range strings in data.year_text, keep int year null
  const edu = data.sections.find((s) => s.title === "Tanulmányok");
  const ranges = ["2011-2017", "2017-2021", "2021-2024", "2024-2026"];
  let i = 0;
  for (const e of edu.entries) {
    e.data = { ...(e.data ?? {}), year_text: ranges[i++] };
  }
  const bytes = await exportToPdf(null, { cvData: data, output: "arraybuffer" });
  fs.writeFileSync("/tmp/cv_yeartext.pdf", Buffer.from(bytes));
  console.log("bytes:", bytes.byteLength);
  require("child_process").execSync("pdfinfo /tmp/cv_yeartext.pdf | grep Pages", { stdio: "inherit" });
})();