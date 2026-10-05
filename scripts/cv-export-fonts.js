// Export with REAL embedded fonts in Node: shims fetch('/fonts/cv/*') to read
// public/fonts/cv/* from disk so registerFontFamily takes its production path.
const path = require("path");
const fs = require("fs");

const repo = process.cwd();

const realFetch = globalThis.fetch;
if (!globalThis.__cvFetchShim) {
  globalThis.__cvFetchShim = true;
  globalThis.fetch = async (url, opts) => {
    if (typeof url === "string" && url.startsWith("/fonts/cv/")) {
      const fp = path.join(repo, "public", url);
      try {
        const data = fs.readFileSync(fp);
        const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => buf,
        };
      } catch {
        return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
      }
    }
    return realFetch(url, opts);
  };
}

const Module = require("module");
if (!globalThis.__cvPathShim) {
  globalThis.__cvPathShim = true;
  const orig = Module._resolveFilename;
  Module._resolveFilename = function (request, ...args) {
    if (request.startsWith("@/")) {
      request = path.join(repo, "src", request.slice(2));
    }
    return orig.call(this, request, ...args);
  };
}

(async () => {
  const { exportToPdf } = require(path.join(repo, "src/lib/pdf-export.ts"));
  const data = JSON.parse(fs.readFileSync("/tmp/cv_live_data.json", "utf-8"));
  const bytes = await exportToPdf(null, { cvData: data, output: "arraybuffer" });
  fs.writeFileSync("/tmp/cv_harness_fonts.pdf", Buffer.from(bytes));
  console.log("PDF bytes:", bytes.byteLength, "-> /tmp/cv_harness_fonts.pdf");
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});