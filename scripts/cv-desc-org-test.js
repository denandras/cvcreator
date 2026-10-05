// E2E for inline WITH organization: "Országos döntő, Szeged — II. díj" must
// share one line/wrap block; pagination measures identically.
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
  const data = JSON.parse(JSON.stringify(live));
  // Add an org to the first Versenyek entry's hu translation
  for (const s of data.sections) {
    if (s.title === "Versenyek") {
      for (const t of s.entries[0].translations) {
        if (t.language === "hu") t.organization = "Országos döntő, Szeged";
      }
    }
  }
  data.design = { ...data.design, custom_config: { ...(data.design.custom_config ?? {}), descriptionPlacement: "inline", descriptionSeparator: "—" } };
  const bytes = await exportToPdf(null, { cvData: data, output: "arraybuffer" });
  fs.writeFileSync("/tmp/cv_desc_org.pdf", Buffer.from(bytes));
  console.log("bytes:", bytes.byteLength);
  require("child_process").execSync("pdfinfo /tmp/cv_desc_org.pdf | grep Pages", { stdio: "inherit" });
})();