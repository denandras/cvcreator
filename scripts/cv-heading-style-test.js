// Heading-style override verification: export with each custom_config.headingStyle
// value and check the PDF heading ink changes accordingly (fill rect for
// "filled", horizontal line for "underline", vertical line for "border", none
// for "minimal").
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

const { exportToPdf } = require(path.join(repo, "src/lib/pdf-export.ts"));

(async () => {
  const results = {};
  for (const style of ["auto", "underline", "border", "filled", "minimal"]) {
    const data = JSON.parse(JSON.stringify(live));
    data.design = { ...data.design, custom_config: { ...(data.design.custom_config ?? {}), headingStyle: style } };
    const bytes = await exportToPdf(null, { cvData: data, output: "arraybuffer" });
    fs.writeFileSync(`/tmp/cv_hs_${style}.pdf`, Buffer.from(bytes));
    results[style] = bytes.byteLength;
  }
  console.log("bytes per style:", results);
  console.log("distinct outputs:", new Set(Object.values(results)).size, "of 5");
})();