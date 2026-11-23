// Fixture generator for the keep-with-next acceptance harness (card 2/7,
// REPORT §4 Step 3). Emits scripts/fixtures/keepnext-*.json — one CV per
// pagination edge case, all on the DEMO design (template clean → border
// headings, spacing normal, pageMargin 48) so the same section data drives
// BOTH engines: the node harness (exportToPdf, design read from the JSON)
// and the browser audit on /demo (design fixed to getDemoDesign()).
//
// Entry heights on the exporter's model (traced with CV_FLOW_TRACE on the
// demo build): one-line title (18.24pt) + one-line org (15pt) + desc
// (mt-1 3pt + 15pt) + item gap (6pt) = 57.24pt; title+desc without org =
// 42.24pt; heading advance (border) = 29.25pt; section tail = 15pt;
// bottomLimit = 805.89pt; header = 74.7pt on page 1.
//
// Run: node_modules/.bin/sucrase-node scripts/gen-keepnext-fixtures.js
const fs = require("fs");
const path = require("path");

const OUT_DIR = path.join(__dirname, "fixtures");

let idc = 0;
const nid = (p) => `${p}-${(idc += 1)}`;
const now = new Date().toISOString();

const design = {
  id: "fixture-design",
  cv_id: "fixture-cv",
  template: "clean",
  font_family: "inter",
  primary_color: "#0f172a",
  accent_color: "#3b82f6",
  spacing: "normal",
  border_radius: 8,
  page_margin: 48,
  custom_config: { paletteId: "slate" },
  created_at: now,
  updated_at: now,
};

function mkEntry(year, title, organization, description) {
  const id = nid("entry");
  return {
    id,
    section_id: "",
    year,
    is_enabled: true,
    sort_order: 0,
    data: {},
    created_at: now,
    updated_at: now,
    translations: [
      {
        id: nid("tr"),
        entry_id: id,
        language: "hu",
        title,
        organization,
        description,
        data: {},
        created_at: now,
        updated_at: now,
      },
    ],
  };
}

function mkSection(title, entries, opts = {}) {
  const id = nid("sec");
  const section = {
    id,
    cv_id: "fixture-cv",
    title,
    is_enabled: opts.is_enabled !== false,
    sort_order: 0,
    entry_sort_mode: "year_desc",
    layout_config: opts.layout_config || {},
    created_at: now,
    updated_at: now,
  };
  const patched = entries.map((e, i) => ({ ...e, section_id: id, sort_order: i }));
  return { ...section, entries: patched };
}

// N generic one-line entries with descending years (year_desc sort keeps
// array order). One-line title/org/desc → 57.24pt charge each on the
// exporter model.
function fillEntries(n, prefix, startYear = 2024) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(
      mkEntry(
        startYear - i,
        `${prefix} pozíció ${i + 1}`,
        `${prefix} Kft. ${i + 1}`,
        `${prefix} tevékenység leírása ${i + 1}.`
      )
    );
  }
  return out;
}

const fixtures = {};

// 1) orphan-heading: section A (10 entries) ends at curY ≈ 727.35pt on the
// current model; section B's heading (advance 29.25) fits the remaining
// 78.54pt but its first entry (57.24) does not — WITHOUT the explicit rule
// the heading stays and page 1 ends with an orphaned heading. With the
// rule, the heading flushes to page 2 with its entries.
fixtures["keepnext-orphan-heading"] = {
  profileName: "Teszt Elek",
  profileTitle: "Mérnök",
  profilePicture: null,
  activeLang: "hu",
  design,
  sections: [
    mkSection("Első szakasz", fillEntries(10, "Első")),
    mkSection("Második szakasz", fillEntries(2, "Második")),
  ],
};

// 2) empty-section: a section whose entries are all DISABLED renders as a
// heading-only flow item; its heading must chain through the NEXT
// section's heading to the first real body item, never ending a page.
fixtures["keepnext-empty-section"] = {
  profileName: "Teszt Elek",
  profileTitle: "Mérnök",
  profilePicture: null,
  activeLang: "hu",
  design,
  sections: [
    mkSection("Első szakasz", fillEntries(10, "Első")),
    mkSection("Üres szakasz", fillEntries(2, "Üres").map((e) => ({ ...e, is_enabled: false }))),
    mkSection("Harmadik szakasz", fillEntries(2, "Harmadik")),
  ],
};

// 3) single-entry-sections: six heading+entry pairs after a 10-entry
// opener — several keep-with-next decisions in a row as the pairs straddle
// the page boundary (a pair ≈ 101.5pt on the current model).
fixtures["keepnext-single-entry-sections"] = {
  profileName: "Teszt Elek",
  profileTitle: "Mérnök",
  profilePicture: null,
  activeLang: "hu",
  design,
  sections: [
    mkSection("Nyitó szakasz", fillEntries(10, "Nyitó")),
    mkSection("Egyszemélyes egy", [mkEntry(2020, "Egyedüli pozíció egy", "Egy Kft.", "Egy leírás.")]),
    mkSection("Egyszemélyes kettő", [mkEntry(2019, "Egyedüli pozíció kettő", "Kettő Kft.", "Kettő leírás.")]),
    mkSection("Egyszemélyes három", [mkEntry(2018, "Egyedüli pozíció három", "Három Kft.", "Három leírás.")]),
    mkSection("Egyszemélyes négy", [mkEntry(2017, "Egyedüli pozíció négy", "Négy Kft.", "Négy leírás.")]),
    mkSection("Egyszemélyes öt", [mkEntry(2016, "Egyedüli pozíció öt", "Öt Kft.", "Öt leírás.")]),
    mkSection("Egyszemélyes hat", [mkEntry(2015, "Egyedüli pozíció hat", "Hat Kft.", "Hat leírás.")]),
  ],
};

// 4) twocol-split: a two-column section whose block is taller than one
// page — the block SPLITS per column. The heading only needs its first
// placeable entry beside it (NOT the whole block): the split layout that
// works today must keep working, page count unchanged.
fixtures["keepnext-twocol-split"] = {
  profileName: "Teszt Elek",
  profileTitle: "Mérnök",
  profilePicture: null,
  activeLang: "hu",
  design,
  sections: [
    mkSection("Rövid szakasz", fillEntries(2, "Rövid")),
    mkSection("Kétoszlopos szakasz", fillEntries(30, "Oszlop"), {
      layout_config: { columns: "two" },
    }),
  ],
};

// 5) page-break-before: a section explicitly set to start on a fresh page
// (user checkbox). The forced break must keep working alongside
// keep-with-next; the sections around it must not orphan.
fixtures["keepnext-page-break-before"] = {
  profileName: "Teszt Elek",
  profileTitle: "Mérnök",
  profilePicture: null,
  activeLang: "hu",
  design,
  sections: [
    mkSection("Első szakasz", fillEntries(10, "Első")),
    mkSection("Törött szakasz", fillEntries(2, "Törött"), {
      layout_config: { page_break_before: true },
    }),
    mkSection("Záró szakasz", fillEntries(2, "Záró")),
  ],
};

// 6) many-sections: 8 sections of varied sizes (1-4 entries, a two-line
// description here and there) flowing over 3+ pages — a sweep of natural
// boundary decisions where no page may end with a heading.
fixtures["keepnext-many-sections"] = {
  profileName: "Teszt Elek",
  profileTitle: "Mérnök",
  profilePicture: null,
  activeLang: "hu",
  design,
  sections: [
    mkSection("Szakasz egy", fillEntries(6, "Egy")),
    mkSection("Szakasz kettő", [
      ...fillEntries(2, "Kettő"),
      mkEntry(2021, "Hosszú leírású pozíció", "Hosszú Kft.", "Ez a leírás szándékosan hosszabb, hogy két sorba törjön a renderelés során a szöveg, és ezzel a bejegyzés magasabb legyen."),
    ]),
    mkSection("Szakasz három", fillEntries(5, "Három")),
    mkSection("Szakasz négy", fillEntries(2, "Négy")),
    mkSection("Szakasz öt", fillEntries(4, "Öt")),
    mkSection("Szakasz hat", fillEntries(3, "Hat")),
    mkSection("Szakasz hét", fillEntries(2, "Hét")),
    mkSection("Szakasz nyolc", fillEntries(1, "Nyolc")),
  ],
};

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [name, cv] of Object.entries(fixtures)) {
  fs.writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify(cv, null, 2));
  console.log(`wrote fixtures/${name}.json`);
}
console.log("done");
