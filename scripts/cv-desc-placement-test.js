// E2E for inline description placement: data.custom_config.descriptionPlacement
// = "inline" + separator variants → descriptions flow after title/org in the
// PDF, pagination stays in bounds, and page count should DROP vs "below".
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
globalThis.window = globalThis.window ?? globalThis;
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
  for (const [label, placement, sep] of [
    ["below", "below", "—"],
    ["inline-dash", "inline", "—"],
    ["inline-colon", "inline", ":"],
  ]) {
    const data = JSON.parse(JSON.stringify(live));
    data.design = { ...data.design, custom_config: { ...(data.design.custom_config ?? {}), descriptionPlacement: placement, descriptionSeparator: sep } };
    const bytes = await exportToPdf(null, { cvData: data, output: "arraybuffer" });
    fs.writeFileSync(`/tmp/cv_desc_${label}.pdf`, Buffer.from(bytes));
    const info = require("child_process").execSync(`pdfinfo /tmp/cv_desc_${label}.pdf | grep Pages`).toString().trim();
    console.log(label, bytes.byteLength, "bytes,", info);
  }
})();