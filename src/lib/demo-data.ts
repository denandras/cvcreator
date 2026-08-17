import type {
  SectionWithEntries,
  CVDesign,
  EntryWithTranslations,
  CVEntry,
  CVTranslation,
  CVSection,
} from "@/types/database";

/**
 * In-memory demo data — Hungarian sample CV for Kovács Tamás, Építész.
 * All operations are local (no Supabase calls). Reset restores this state.
 */

let demoIdCounter = 0;
function demoId(prefix: string): string {
  demoIdCounter += 1;
  return `demo-${prefix}-${demoIdCounter}`;
}

function makeEntry(
  year: number,
  translations: { lang: string; title: string; organization: string | null; description: string | null }[]
): EntryWithTranslations {
  const entryId = demoId("entry");
  const entry: CVEntry = {
    id: entryId,
    section_id: "",
    year,
    is_enabled: true,
    sort_order: 0,
    data: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const trs: CVTranslation[] = translations.map((t) => ({
    id: demoId("tr"),
    entry_id: entryId,
    language: t.lang,
    title: t.title,
    organization: t.organization,
    description: t.description,
    data: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
  return { ...entry, translations: trs };
}

function makeSection(
  title: string,
  sectionType: string,
  sortOrder: number,
  entries: EntryWithTranslations[]
): SectionWithEntries {
  const sectionId = demoId("sec");
  const section: CVSection = {
    id: sectionId,
    cv_id: "demo-cv",
    title,
    section_type: sectionType as any,
    is_enabled: true,
    sort_order: sortOrder,
    entry_sort_mode: "year_desc",
    layout_config: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  // Patch entry.section_id
  const patchedEntries = entries.map((e, i) => ({ ...e, section_id: sectionId, sort_order: i }));
  return { ...section, entries: patchedEntries };
}

export interface DemoProfile {
  name: string;
  title: string;
}

export function getDemoProfile(): DemoProfile {
  return { name: "Kovács Tamás", title: "Építész" };
}

export function getDemoSections(): SectionWithEntries[] {
  return [
    makeSection("Tapasztalat", "experience", 0, [
      makeEntry(2023, [
        { lang: "hu", title: "Vezető építész", organization: "KÖZÉPÍT Építészeti Stúdió Kft.", description: "Lakó- és közintézmények tervezése, projektmenedzsment, 12 fős csapat irányítása." },
        { lang: "en", title: "Lead Architect", organization: "KÖZÉPÍT Architecture Studio Ltd.", description: "Residential and institutional building design, project management, leading a 12-person team." },
        { lang: "de", title: "Leitender Architekt", organization: "KÖZÉPÍT Architekturstudio GmbH", description: "Entwurf von Wohn- und Institutsgebäuden, Projektmanagement, Leitung eines 12-köpfigen Teams." },
        { lang: "fr", title: "Architecte en chef", organization: "KÖZÉPÍT Studio d'Architecture", description: "Conception de bâtiments résidentiels et institutionnels, gestion de projet, direction d'une équipe de 12 personnes." },
      ]),
      makeEntry(2019, [
        { lang: "hu", title: "Építész", organization: "BUDA-TERV Zrt.", description: "Középületek és irodaKomplexumok tervezése, hatósági egyeztetések, tervdokumentáció készítése." },
        { lang: "en", title: "Architect", organization: "BUDA-TERV Plc.", description: "Design of public buildings and office complexes, authority consultations, preparation of design documentation." },
        { lang: "de", title: "Architekt", organization: "BUDA-TERV AG", description: "Entwurf öffentlicher Gebäude und Bürokomplexe, Behördenverhandlungen, Erstellung von Plandokumentationen." },
        { lang: "fr", title: "Architecte", organization: "BUDA-TERV SA", description: "Conception de bâtiments publics et de complexes de bureaux, consultations administratives, préparation de documentations techniques." },
      ]),
      makeEntry(2016, [
        { lang: "hu", title: "Junior építész", organization: "ARCH-I-DEA Kft.", description: "Családi házak és kisebb lakóparkok tervezése, 3D vizualizáció, ügyfélkommunikáció." },
        { lang: "en", title: "Junior Architect", organization: "ARCH-I-DEA Ltd.", description: "Design of family houses and smaller residential parks, 3D visualization, client communication." },
        { lang: "de", title: "Junior Architekt", organization: "ARCH-I-DEA GmbH", description: "Entwurf von Einfamilienhäusern und kleineren Wohnparks, 3D-Visualisierung, Kundenkommunikation." },
        { lang: "fr", title: "Architecte junior", organization: "ARCH-I-DEA SARL", description: "Conception de maisons individuelles et de petits lotissements, visualisation 3D, communication client." },
      ]),
    ]),
    makeSection("Tanulmányok", "education", 1, [
      makeEntry(2016, [
        { lang: "hu", title: "MSc Építészmérnöki", organization: "Budapesti Műszaki és Gazdaságtudományi Egyetem", description: "Diploma a Szent György építész szakon, diplomamunka: közösségi központ tervezése." },
        { lang: "en", title: "MSc Architecture", organization: "Budapest University of Technology and Economics", description: "Degree in architecture, thesis: community center design." },
        { lang: "de", title: "MSc Architektur", organization: "Technische Universität Budapest", description: "Abschluss in Architektur, Diplomarbeit: Entwurf eines Gemeindezentrums." },
        { lang: "fr", title: "Master en Architecture", organization: "Université Technique de Budapest", description: "Diplôme en architecture, mémoire: conception d'un centre communautaire." },
      ]),
      makeEntry(2014, [
        { lang: "hu", title: "BSc Építészmérnöki", organization: "Budapesti Műszaki és Gazdaságtudományi Egyetem", description: "Alapképzés az Építőmérnöki Kar építészmérnöki szakán." },
        { lang: "en", title: "BSc Architecture", organization: "Budapest University of Technology and Economics", description: "Undergraduate studies at the Faculty of Civil Engineering, Architecture programme." },
        { lang: "de", title: "BSc Architektur", organization: "Technische Universität Budapest", description: "Bachelorstudium an der Fakultät für Bauingenieurwesen, Architekturprogramm." },
        { lang: "fr", title: "Licence en Architecture", organization: "Université Technique de Budapest", description: "Études de premier cycle à la Faculté de Génie Civil, programme d'architecture." },
      ]),
    ]),
    makeSection("Készségek", "skills", 2, [
      makeEntry(0, [
        { lang: "hu", title: "AutoCAD, Revit, ArchiCAD, SketchUp", organization: null, description: "Tervezőszoftverek haladó szinten." },
        { lang: "en", title: "AutoCAD, Revit, ArchiCAD, SketchUp", organization: null, description: "Advanced level design software." },
        { lang: "de", title: "AutoCAD, Revit, ArchiCAD, SketchUp", organization: null, description: "Fortgeschrittene Design-Software." },
        { lang: "fr", title: "AutoCAD, Revit, ArchiCAD, SketchUp", organization: null, description: "Logiciels de conception de niveau avancé." },
      ]),
      makeEntry(0, [
        { lang: "hu", title: "Projektmenedzsment, csapatvezetés", organization: null, description: "Agile és waterfall módszertan, 12 fős csapat irányítása." },
        { lang: "en", title: "Project management, team leadership", organization: null, description: "Agile and waterfall methodology, leading a 12-person team." },
        { lang: "de", title: "Projektmanagement, Teamleitung", organization: null, description: "Agile und Wasserfall-Methodik, Leitung eines 12-köpfigen Teams." },
        { lang: "fr", title: "Gestion de projet, leadership d'équipe", organization: null, description: "Méthodologie agile et en cascade, direction d'une équipe de 12 personnes." },
      ]),
    ]),
    makeSection("Díjak", "awards", 3, [
      makeEntry(2022, [
        { lang: "hu", title: "Év építésze — Magyar Építész Kamara", organization: "Magyar Építész Kamara", description: "Az év legjobb középület-terve kategóriában." },
        { lang: "en", title: "Architect of the Year — Hungarian Chamber of Architects", organization: "Hungarian Chamber of Architects", description: "Best public building design of the year." },
        { lang: "de", title: "Architekt des Jahres — Ungarische Architektenkammer", organization: "Ungarische Architektenkammer", description: "Bester öffentlicher Gebäudeentwurf des Jahres." },
        { lang: "fr", title: "Architecte de l'année — Chambre des Architectes Hongrois", organization: "Chambre des Architectes Hongrois", description: "Meilleure conception de bâtiment public de l'année." },
      ]),
      makeEntry(2020, [
        { lang: "hu", title: "Budapest Építészeti Díj", organization: "Budapest Főváros Önkormányzata", description: "Elismerés a Városháza felújítási projektjéért." },
        { lang: "en", title: "Budapest Architecture Award", organization: "Municipality of Budapest", description: "Recognition for the City Hall renovation project." },
        { lang: "de", title: "Budapester Architekturpreis", organization: "Stadtverwaltung Budapest", description: "Anerkennung für das Rathaus-Renovierungsprojekt." },
        { lang: "fr", title: "Prix d'Architecture de Budapest", organization: "Municipalité de Budapest", description: "Reconnaissance pour le projet de rénovation de l'Hôtel de Ville." },
      ]),
    ]),
    makeSection("Projektek", "projects", 4, [
      makeEntry(2023, [
        { lang: "hu", title: "Szent György Közösségi Központ", organization: "KÖZÉPÍT Stúdió", description: "2000 m²-es közösségi központ, passzívház szabvány, helyi anyagok." },
        { lang: "en", title: "St. George Community Center", organization: "KÖZÉPÍT Studio", description: "2000 m² community center, passive house standard, local materials." },
        { lang: "de", title: "St. Georg Gemeindezentrum", organization: "KÖZÉPÍT Studio", description: "2000 m² Gemeindezentrum, Passivhaus-Standard, lokale Materialien." },
        { lang: "fr", title: "Centre Communautaire Saint-Georges", organization: "KÖZÉPÍT Studio", description: "Centre communautaire de 2000 m², standard maison passive, matériaux locaux." },
      ]),
      makeEntry(2021, [
        { lang: "hu", title: "Zöld Lakópark, Budaörs", organization: "BUDA-TERV Zrt.", description: "120 lakásos lakópark, zöld tető, napelemes rendszer, közösségi kert." },
        { lang: "en", title: "Green Residential Park, Budaörs", organization: "BUDA-TERV Plc.", description: "120-unit residential park, green roof, solar panels, community garden." },
        { lang: "de", title: "Grüner Wohnpark, Budaörs", organization: "BUDA-TERV AG", description: "Wohnpark mit 120 Wohneinheiten, Gründach, Solaranlagen, Gemeinschaftsgarten." },
        { lang: "fr", title: "Parc Résidentiel Vert, Budaörs", organization: "BUDA-TERV SA", description: "Parc résidentiel de 120 logements, toiture végétalisée, panneaux solaires, jardin communautaire." },
      ]),
    ]),
  ];
}

export function getDemoDesign(): CVDesign {
  return {
    id: "demo-design",
    cv_id: "demo-cv",
    template: "clean",
    font_family: "inter",
    primary_color: "#0f172a",
    accent_color: "#3b82f6",
    spacing: "normal",
    border_radius: 8,
    page_margin: 48,
    custom_config: { paletteId: "slate" },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

let _idCounter = 1000;
export function genDemoId(prefix: string): string {
  _idCounter += 1;
  return `demo-${prefix}-${_idCounter}`;
}