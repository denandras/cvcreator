import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Adatkezelési tájékoztató — CV Creator",
  description:
    "A CV Creator alkalmazás adatkezelési tájékoztatója (GDPR / Infotv. szerint).",
};

type Section = {
  heading: string;
  body?: string[];
  list?: string[];
  body2?: string[];
  subsections?: { heading: string; body?: string[]; list?: string[] }[];
};

type Content = {
  lang: "hu" | "en";
  title: string;
  subtitle: string;
  effective: string;
  version: string;
  otherLangHref: string;
  otherLangLabel: string;
  back: string;
  sections: Section[];
  footerNote: string;
};

const HU: Content = {
  lang: "hu",
  title: "Adatkezelési tájékoztató",
  subtitle: "CV Creator — cv.denandras.cloud",
  effective: "Hatályos: 2026. november 24. napjától",
  version: "1.0 verzió",
  otherLangHref: "?lang=en",
  otherLangLabel: "English version",
  back: "Vissza a főoldalra",
  sections: [
    {
      heading: "1. Az adatkezelő",
      body: [
        "A CV Creator online önéletrajz-készítő alkalmazást (a továbbiakban: Alkalmazás; elérhetősége: cv.denandras.cloud) Dénes András magánszemély üzemelteti (a továbbiakban: Adatkezelő).",
        "Az Adatkezelő elérhetőségei: e-mail: contact@andrasdenes.com; székhely/tevékenység helye: Budapest, Magyarország.",
        "Az Adatkezelő adatvédelmi tisztviselőt (DPO) nem alkalmaz, mert az adatkezelés jellege és mértéke alapján erre a GDPR 37. cikke szerint nem kötelezett.",
      ],
    },
    {
      heading: "2. A tájékoztató hatálya és a jogszabályi háttér",
      body: [
        "Jelen tájékoztató az Alkalmazás látogatóira, valamint az Alkalmazásban regisztrált felhasználókra (a továbbiakban együtt: Érintett) vonatkozik, és a személyes adatok kezelésének minden mozzanatára kiterjed.",
        "Az adatkezelésre különösen az alábbi jogszabályok rendelkezései irányadók: az Európai Parlament és a Tanács (EU) 2016/679 rendelete (Általános Adatvédelmi Rendelet, a továbbiakban: GDPR); a 2011. évi CXII. törvény az információs önrendelkezési jogról és az információszabadságról (Infotv.); a 2001. évi CVIII. törvény az elektronikus kereskedelmi szolgáltatásokról (Ekertv.).",
        "A tájékoztató a szolgáltatás ingyenes használatára tekintettel fogyasztói szerződésre vonatkozó speciális rendelkezéseket nem tartalmaz; a felhasználói fiók létrehozására és használatára a GDPR és jelen tájékoztató szabályai alkalmazandók.",
      ],
    },
    {
      heading: "3. A kezelt személyes adatok köre",
      body: [
        "Az Adatkezelő kizárólag az Alkalmazás működéséhez szükséges személyes adatokat kezeli. Az adatok köre attól függ, hogy az Érintett kizárólag megtekinti az Alkalmazást, regisztráció nélkül kipróbálja azt, vagy fiókot hoz létre.",
      ],
      subsections: [
        {
          heading: "3.1. Regisztráció és bejelentkezés (fiókadatok)",
          list: [
            "e-mail-cím — a fiók azonosításához, a belépéshez és a regisztráció megerősítéséhez;",
            "jelszó — kizárólag titkosított (visszafejthetetlen hash) formában tárolva, az Adatkezelő a jelszót nem ismeri és nem látja;",
            "felhasználói azonosító (UUID), a regisztráció időpontja, a fiók e-mail-címének megerősítettségére vonatkozó állapot;",
            "az Adatkezelő által megjelenített név (profilnév), amennyiben az Érintett megadja.",
          ],
        },
        {
          heading: "3.2. Az önéletrajz tartalma (az Érintett által megadott adatok)",
          body: [
            "Az Alkalmazás önéletrajz-szerkesztő. A feltöltött tartalom az Érintett szabad döntésén alapul, ezért az Érintett maga határozza meg, milyen személyes adatot ír az önéletrajzába.",
          ],
          list: [
            "az önéletrajz címe, szekciói és bejegyzései (például: munkatapasztalat, tanulmányok, készségek, nyelvek, díjak, évszámok);",
            "a megadott intézmények, munkáltatók, pozíciók és leírások szövege, valamint azok idegen nyelvű fordításai;",
            "az önéletrajz megjelenítési beállításai (sablon, betűtípus, színek, elrendezés, margók);",
            "minden egyéb adat, amelyet az Érintett a szerkesztő mezőibe beír.",
          ],
        },
        {
          heading: "3.3. Technikai adatok",
          list: [
            "a kiszolgáló- és biztonsági naplókban kezelt technikai adatok: IP-cím, böngésző és operációs rendszer típusa, a kérés időpontja és a kért erőforrás — a szolgáltatás biztonságos működtetése céljából;",
            "a munkamenet fenntartását szolgáló, a böngészőben elhelyezett süti (lásd a 9. pontot).",
          ],
        },
        {
          heading: "3.4. Amit az Adatkezelő NEM kezel",
          list: [
            "Profilkép / fénykép: az Alkalmazás a feltöltött képet kizárólag a felhasználó böngészőjében (localStorage) tárolja, az nem kerül a szerverre, így az Adatkezelő ahhoz nem fér hozzá;",
            "Demó mód: a demó módban megadott adat kizárólag a böngésző helyi tárhelyén marad, fiók létrehozása nélkül az Adatkezelő nem jut hozzá;",
            "bankkártya-adat, fizetési adat: az Alkalmazás ingyenes, fizetési adatot nem kér és nem kezel;",
            "különleges kategóriájú adat (egészségi állapot, vallási meggyőződés, politikai nézet, szakszervezeti tagság, szexuális irányultság, bűnügyi adat): az Alkalmazás nem kéri és nem használja fel ilyen adat kezelését. Kérjük, az önéletrajzban se adjon meg ilyen adatot.",
            "harmadik féltől származó marketing- vagy analitikai követőkód, közösségi beépülő modul: az Alkalmazás nem tartalmaz ilyet (lásd 9. pont).",
          ],
        },
      ],
    },
    {
      heading: "4. Az adatkezelés célja és jogalapja",
      body: [
        "Az Adatkezelő a személyes adatokat a GDPR 6. cikke szerinti alábbi célokból és jogalapokon kezeli. A cél és a jogalap páronként, egyértelműen kerül meghatározásra.",
      ],
      subsections: [
        {
          heading: "4.1. A szolgáltatás nyújtása (fiók, önéletrajz mentése, PDF-export)",
          body: [
            "Cél: a regisztrált felhasználó számára a szolgáltatás biztosítása — bejelentkezés, az önéletrajz tárolása, szerkesztése és PDF-formátumban történő letöltése.",
            "Jogalap: a GDPR 6. cikk (1) bekezdés b) pontja — az Érintett által kezdeményezett szerződés (használati jogviszony) teljesítése. Az e-mail-cím és a jelszó megadása a szolgáltatás igénybevételének előfeltétele; ezek nélkül a fiók nem hozható létre.",
            "Az önéletrajz tartalmának megadása önkéntes: az Érintett dönti el, milyen adatot ír be. A tartalom kezelése a szolgáltatás teljesítéséhez szükséges mértékben, szintén a 6. cikk (1) bekezdés b) pontja alapján történik.",
          ],
        },
        {
          heading: "4.2. A szolgáltatás biztonsága és a visszaélések megelőzése",
          body: [
            "Cél: a rendszer rendelkezésre állásának, integritásának és biztonságának biztosítása, jogosulatlan hozzáférés, túlterheléses támadás és egyéb visszaélés megelőzése, a hibák feltárása.",
            "Jogalap: a GDPR 6. cikk (1) bekezdés f) pontja — az Adatkezelő jogos érdeke a biztonságos szolgáltatás működtetéséhez. Az Adatkezelő e körben elvégezte az érdekmérlegelési vizsgálatot; a kezelt adatok köre erre a célra a minimálisra korlátozott (technikai naplóadatok), és az érdekmérlegelés eredményeként az Érintett jogai nem sérülnek.",
          ],
        },
        {
          heading: "4.3. Jogi kötelezettségek teljesítése és igények érvényesítése",
          body: [
            "Cél: az Adatkezelőt terhelő jogszabályi kötelezettségek teljesítése, valamint jogi igények előterjesztése, érvényesítése és védelme.",
            "Jogalap: a GDPR 6. cikk (1) bekezdés c) pontja (jogi kötelezettség) és f) pontja (jogos érdek).",
          ],
        },
        {
          heading: "4.4. Különleges kategóriájú adatok",
          body: [
            "Az Alkalmazás nem irányul ilyen adatok kezelésére. Ha az Érintett mégis különleges kategóriájú adatot ír az önéletrajzába, az adat megadásával a GDPR 9. cikk (2) bekezdés a) pontja szerinti kifejezett hozzájárulását adja ahhoz, hogy az adatot az önéletrajz részeként, a 4.1. pontban leírt célból kezeljük. Az ilyen adat megadása nem kötelező, és a hozzájárulás bármikor visszavonható az adat törlésével vagy az Adatkezelőnek küldött kéréssel.",
          ],
        },
        {
          heading: "4.5. Automatizált döntéshozatal és profilozás",
          body: [
            "Az Adatkezelő nem végez a GDPR 22. cikke szerinti automatizált döntéshozatalt, és nem készít profilt az Érintettekről. Az önéletrajz tartalmát emberi beavatkozás nélküli értékelés nem éri.",
          ],
        },
      ],
    },
    {
      heading: "5. Adatfeldolgozók és adattovábbítás",
      body: [
        "Az Adatkezelő a személyes adatokat harmadik félnek nem adja el, nem adja bérbe és marketingcélra nem továbbítja. A szolgáltatás működtetéséhez az alábbi adatfeldolgozókat veszi igénybe, amelyekkel a GDPR 28. cikke szerinti adatfeldolgozói megállapodás (DPA) áll fenn.",
      ],
      list: [
        "Supabase Inc. — adatbázis-tárhely és felhasználói hitelesítés. A felhasználói fiókok és az önéletrajz-adatok az Európai Unióban, az Amazon Web Services írországi (eu-west-1) régiójában tárolt adatbázisban kerülnek elhelyezésre. A Supabase az Amerikai Egyesült Államokban bejegyzett szolgáltató; a vele kötött megállapodás az EU által elfogadott szerződéses záradékokon (SCC) és az EU–US adatvédelmi keretrendszeren (DPF) alapul. Adatvédelmi tájékoztató: supabase.com/privacy",
        "Vercel Inc. — az Alkalmazás tárhelyszolgáltatása és tartalom-kiszolgálása (peremhálózat). A Vercel az Amerikai Egyesült Államokban bejegyzett szolgáltató; az adattovábbítás jogalapja a vele kötött adatfeldolgozói megállapodás és az EU által elfogadott szerződéses záradékok (SCC). Adatvédelmi tájékoztató: vercel.com/legal/privacy-policy",
        "A regisztrációt követő megerősítő e-mail kiküldését a Supabase beépített hitelesítési e-mail szolgáltatása végzi, kizárólag a megerősítő levél kézbesítése céljából.",
      ],
      subsections: [
        {
          heading: "5.1. Adattovábbítás az Európai Gazdasági Térségen kívülre",
          body: [
            "A tárhely- és adatbázis-szolgáltatók amerikai székhelyű vállalkozások, ezért a velük való kapcsolat adattovábbítást jelent az EGT-n kívülre. A továbbítás jogalapja a GDPR 45. cikke szerinti megfelelőségi határozat (ahol a szolgáltató az EU–US adatvédelmi keretrendszer tanúsított résztvevője), egyéb esetben a GDPR 46. cikke szerinti, az Európai Bizottság által elfogadott általános szerződéses feltételek (SCC), kiegészítő védelmi intézkedésekkel.",
            "Az önéletrajz- és fiókadatok fizikai tárolása az Európai Unió területén (Írország) történik.",
          ],
        },
        {
          heading: "5.2. Hatósági megkeresés",
          body: [
            "Az Adatkezelő személyes adatot harmadik félnek kizárólag jogszabályban előírt kötelezettség teljesítése céljából, hatóság vagy bíróság erre vonatkozó, jogszabályban meghatározott megkeresése esetén ad ki.",
          ],
        },
      ],
    },
    {
      heading: "6. Az adatok tárolásának időtartama",
      list: [
        "Fiókadatok és önéletrajz-tartalom: a felhasználói fiók fennállásáig. A fiók törlését az Érintett bármikor kérheti e-mailben; a törlést az Adatkezelő legkésőbb a kérelem beérkezésétől számított 30 napon belül elvégzi, kivéve, ha jogszabály az adat további megőrzését írja elő.",
        "A törlést követően az adatok a biztonsági mentésekből legkésőbb további 30 napon belül véglegesen eltűnnek.",
        "Technikai naplók (IP-cím, böngészőadatok): a biztonságos működtetéshez szükséges rövid ideig, jellemzően néhány napig, a tárhelyszolgáltató naplózási gyakorlata szerint.",
        "A munkamenet-süti: a böngésző bezárásáig, illetve a munkamenet lejártáig, de legfeljebb a bejelentkezés érvényességéig.",
        "Ha az Érintett a hozzájárulását valamely adat kezeléséhez visszavonja, az érintett adatot a visszavonástól számított 30 napon belül törli az Adatkezelő.",
      ],
    },
    {
      heading: "7. Adatbiztonsági intézkedések",
      body: [
        "Az Adatkezelő a GDPR 32. cikke szerinti megfelelő technikai és szervezési intézkedéseket alkalmazza a személyes adatok védelme érdekében, különösen:",
      ],
      list: [
        "titkosított (HTTPS/TLS) kapcsolat a teljes adatforgalomban;",
        "sor-szintű hozzáférés-vezérlés (Row Level Security) az adatbázisban: minden felhasználó kizárólag a saját önéletrajzához és profiljához fér hozzá, a más felhasználók adatai számára nem elérhetők;",
        "a jelszó kizárólag visszafejthetetlen hash formájában, a Supabase hitelesítési rendszerében tárolva;",
        "az adatbázis titkosítása tárolás közben;",
        "az adatok Európai Unión belüli elhelyezése;",
        "a hozzáférési jogosultságok minimalizálása, rendszeres biztonsági frissítések.",
      ],
      body2: [
        "Az Adatkezelő az adatvédelmi incidenst (például jogosulatlan hozzáférést vagy adatvesztést) a GDPR 33–34. cikke szerint kezeli: indokolatlan késedelem nélkül, legkésőbb 72 órán belül bejelentést tesz a NAIH-nak, és ha az Érintett jogaira nézve magas kockázat áll fenn, őt is tájékoztatja.",
      ],
    },
    {
      heading: "8. Az Érintett jogai és gyakorlásuk módja",
      body: [
        "Az Érintett a GDPR 15–22. cikke alapján az alábbi jogokkal rendelkezik. A jogok gyakorlása díjmentes.",
      ],
      list: [
        "Hozzáférés joga (15. cikk): tájékoztatást kérhet arról, hogy kezelünk-e róla személyes adatot, és megkaphatja a kezelt adatokat és az adatkezelés részleteit;",
        "Helyesbítés joga (16. cikk): kérheti a pontatlan adat javítását, a hiányos adat kiegészítését — az önéletrajz tartalma a szerkesztőben közvetlenül is módosítható;",
        "Törlés joga (17. cikk): kérheti a fiókja és a hozzá tartozó adatok törlését („elfelejtéshez való jog”);",
        "Az adatkezelés korlátozásának joga (18. cikk): kérheti az adatkezelés korlátozását például a helyesség vitatása esetén;",
        "Adathordozhatóság joga (20. cikk): kérheti, hogy a megadott adatait tagolt, széles körben használt, géppel olvasható formátumban (például JSON vagy PDF) bocsássuk rendelkezésére, illetve más adatkezelőnek továbbítsuk;",
        "Tiltakozás joga (21. cikk): tiltakozhat a jogos érdeken alapuló adatkezelés ellen; ebben az esetben az Adatkezelő az adatot csak akkor kezelheti tovább, ha azt kényszerítő erejű jogi ok indokolja;",
        "A hozzájárulás visszavonásának joga: a hozzájáruláson alapuló adatkezelést bármikor, indokolás nélkül visszavonhatja; a visszavonás a korábbi adatkezelés jogszerűségét nem érinti.",
      ],
      subsections: [
        {
          heading: "8.1. Hogyan lehet élni a jogokkal",
          body: [
            "A kérelmet a contact@andrasdenes.com e-mail-címre kell küldeni. Az Adatkezelő a kérelmet indokolatlan késedelem nélkül, de legkésőbb a beérkezésétől számított 30 napon belül megválaszolja. Ha a kérelem összetettsége miatt hosszabb időre van szükség, erről a határidőn belül tájékoztatást ad, legfeljebb további két hónapos indokolt meghosszabbítással.",
            "A személyazonosság visszaélések megelőzése érdekében a kérelem teljesítése előtt ellenőrizhető (például a fiók e-mail-címéről küldött üzenettel).",
          ],
        },
        {
          heading: "8.2. Jogorvoslat",
          body: [
            "Az Érintett jogainak megsértése esetén panaszt tehet a Nemzeti Adatvédelmi és Információszabadság Hatóságnál (NAIH), valamint bírósághoz fordulhat.",
            "NAIH elérhetőségei: 1055 Budapest, Falk Miksa utca 9–11.; levelezési cím: 1363 Budapest, Pf. 9.; telefon: +36 1 391 1400; e-mail: ugyfelszolgalat@naih.hu; weboldal: www.naih.hu",
            "A bírósági út igénybevétele előtt a NAIH-hoz benyújtott panasz nem előfeltétel; a pert a lakóhely vagy tartózkodási hely szerinti törvényszék előtt lehet megindítani.",
          ],
        },
      ],
    },
    {
      heading: "9. Sütik és a böngésző helyi tárhelye",
      body: [
        "Az Alkalmazás kizárólag a működéshez feltétlenül szükséges sütit használ, marketing- vagy analitikai célú sütit nem helyez el, ezért a sütikre vonatkozó hozzájárulás bekérése nem szükséges (a GDPR és az Ekertv. szerint a feltétlenül szükséges sütihez nem kell hozzájárulás).",
      ],
      list: [
        "Munkamenet-süti (a Supabase hitelesítési rendszeréhez tartozó, „sb-” előtagú süti): a bejelentkezés fenntartásához, a fiók azonosításához szükséges. Élettartama a munkamenet időtartama. Ez a süti a bejelentkezés nélküli látogatóknál nem jön létre.",
        "Böngésző helyi tárhelye (localStorage — nem süti, nem kerül továbbításra): a demó módban megadott adatok, a feltöltött profilkép, valamint az egyéni nyelvi beállítások. Ezek az adatok kizárólag az Érintett eszközén maradnak, és a böngésző adatainak törlésével eltávolíthatók.",
        "Az Alkalmazás nem használ harmadik féltől származó követőkódot, közösségi beépülő modult vagy hirdetési azonosítót. A betűtípusok saját tárhelyről töltődnek be, nem külső szolgáltatótól.",
      ],
      body2: [
        "A sütik kezelését a böngésző beállításaiban bármikor módosíthatja; a munkamenet-süti letiltása esetén a bejelentkezés és így az önéletrajz-szerkesztés nem működik.",
      ],
    },
    {
      heading: "10. Gyermekek adatainak védelme",
      body: [
        "Az Alkalmazás 16. életévét be nem töltött személyek számára önálló regisztrációt nem tesz lehetővé. A GDPR 8. cikke és az Infotv. szerint 16. életév alatti érintett személyes adatának kezeléséhez a szülői felügyeletet gyakorló személy hozzájárulása szükséges. Ha az Adatkezelő tudomására jut, hogy 16 év alatti személy hozzájárulás nélkül hozott létre fiókot, a fiókot és az ahhoz tartozó adatokat törli.",
      ],
    },
    {
      heading: "11. A tájékoztató módosítása",
      body: [
        "Az Adatkezelő a tájékoztatót az adatkezelés megváltozása esetén, illetve jogszabályváltozás miatt módosíthatja. A mindenkor hatályos szöveg az Alkalmazásban, ezen az oldalon érhető el, a hatálybalépés napjának feltüntetésével.",
        "Lényeges változás esetén — ha az az Érintett jogait vagy az adatkezelés körülményeit érdemben érinti — az Adatkezelő a regisztrált felhasználókat e-mailben vagy az Alkalmazásban megjelenő értesítéssel előzetesen tájékoztatja.",
      ],
    },
    {
      heading: "12. Kapcsolat",
      body: [
        "Adatkezeléssel kapcsolatos kérdés, kérelem vagy panasz esetén az Adatkezelő az alábbi elérhetőségen áll rendelkezésre:",
        "Dénes András — e-mail: contact@andrasdenes.com",
        "Az Adatkezelő a megkereséseket legkésőbb 30 napon belül megválaszolja.",
      ],
    },
  ],
  footerNote:
    "Ez a tájékoztató a GDPR 13–14. cikke szerinti tájékoztatási kötelezettség teljesítését szolgálja. A dokumentum nem minősül jogi tanácsadásnak; lényeges adatkezelési változás esetén javasolt szakjogi ellenőrzés.",
};

const EN: Content = {
  lang: "en",
  title: "Privacy Notice",
  subtitle: "CV Creator — cv.denandras.cloud",
  effective: "Effective from 24 November 2026",
  version: "Version 1.0",
  otherLangHref: "?lang=hu",
  otherLangLabel: "Magyar változat",
  back: "Back to home",
  sections: [
    {
      heading: "1. Data controller",
      body: [
        "The CV Creator online CV builder (the \"App\", available at cv.denandras.cloud) is operated by András Dénes, private individual (the \"Controller\").",
        "Controller's contact details: e-mail: contact@andrasdenes.com; place of activity: Budapest, Hungary.",
        "The Controller has not appointed a Data Protection Officer, as the nature and scale of the processing does not make this mandatory under Article 37 GDPR.",
      ],
    },
    {
      heading: "2. Scope and legal framework",
      body: [
        "This notice applies to visitors of the App and to users with a registered account (together: \"Data Subject\"), and covers every stage of the processing of personal data.",
        "The processing is governed in particular by Regulation (EU) 2016/679 (General Data Protection Regulation, \"GDPR\"), Hungarian Act CXII of 2011 on Informational Self-Determination and Freedom of Information (\"Infotv.\"), and Act CVIII of 2001 on Electronic Commerce Services (\"Ekertv.\").",
      ],
    },
    {
      heading: "3. Categories of personal data processed",
      body: [
        "The Controller processes only the personal data required for the App to function. The scope depends on whether the Data Subject merely browses the App, tries it without registering, or creates an account.",
      ],
      subsections: [
        {
          heading: "3.1. Registration and sign-in (account data)",
          list: [
            "e-mail address — to identify the account, to sign in and to confirm the registration;",
            "password — stored only as an irreversible hash; the Controller cannot see or recover it;",
            "user identifier (UUID), registration timestamp, e-mail confirmation status;",
            "a display name, if the Data Subject provides one.",
          ],
        },
        {
          heading: "3.2. CV content (data entered by the Data Subject)",
          body: [
            "The App is a CV editor. The content entered is entirely up to the Data Subject, who therefore decides which personal data appears in the CV.",
          ],
          list: [
            "CV title, sections and entries (e.g. work experience, education, skills, languages, awards, years);",
            "the text of organisations, employers, positions and descriptions entered, including their translations;",
            "visual settings of the CV (template, font, colours, layout, margins);",
            "any other data typed into the editor fields.",
          ],
        },
        {
          heading: "3.3. Technical data",
          list: [
            "technical data in server and security logs: IP address, browser and operating system type, request timestamp and requested resource — for secure operation of the service;",
            "a session cookie stored in the browser to keep the user signed in (see section 9).",
          ],
        },
        {
          heading: "3.4. What the Controller does NOT process",
          list: [
            "Profile photo: any uploaded image is stored only in the user's own browser (localStorage) and never reaches the server, so the Controller has no access to it;",
            "Demo mode: data entered in demo mode stays only in the browser's local storage; without an account the Controller has no access to it;",
            "card or payment data: the App is free of charge and never asks for payment data;",
            "special-category data (health, religious belief, political opinion, trade-union membership, sexual orientation, criminal data): the App does not request or use such data. Please do not include such data in your CV.",
            "third-party marketing or analytics trackers, social plug-ins: the App contains none (see section 9).",
          ],
        },
      ],
    },
    {
      heading: "4. Purposes and legal bases",
      body: [
        "The Controller processes personal data for the purposes and on the legal bases set out below, under Article 6 GDPR. Each purpose is paired with one clearly identified legal basis.",
      ],
      subsections: [
        {
          heading: "4.1. Providing the service (account, CV storage, PDF export)",
          body: [
            "Purpose: providing the service to registered users — sign-in, storing and editing the CV, and downloading it as a PDF.",
            "Legal basis: Article 6(1)(b) GDPR — performance of a contract (the terms of use) to which the Data Subject is party. Providing the e-mail address and password is a precondition of using the service; without them no account can be created.",
            "Providing CV content is voluntary: the Data Subject decides what to enter. That content is processed to the extent necessary to perform the service, also under Article 6(1)(b).",
          ],
        },
        {
          heading: "4.2. Security of the service and abuse prevention",
          body: [
            "Purpose: ensuring availability, integrity and security of the system; preventing unauthorised access, denial-of-service and other abuse; detecting faults.",
            "Legal basis: Article 6(1)(f) GDPR — the Controller's legitimate interest in operating a secure service. A balancing test has been carried out; the data used for this purpose is limited to the minimum (technical log data) and, as a result of the balancing test, the Data Subject's rights are not prejudiced.",
          ],
        },
        {
          heading: "4.3. Legal obligations and defence of claims",
          body: [
            "Purpose: compliance with statutory obligations and the establishment, exercise or defence of legal claims.",
            "Legal basis: Article 6(1)(c) (legal obligation) and (f) (legitimate interest) GDPR.",
          ],
        },
        {
          heading: "4.4. Special-category data",
          body: [
            "The App is not intended to process such data. If the Data Subject nevertheless enters special-category data in the CV, by doing so they give explicit consent under Article 9(2)(a) GDPR to its processing as part of the CV for the purpose described in 4.1. Providing such data is never mandatory, and the consent can be withdrawn at any time by deleting the data or by asking the Controller.",
          ],
        },
        {
          heading: "4.5. Automated decision-making and profiling",
          body: [
            "The Controller carries out no automated decision-making within the meaning of Article 22 GDPR and does not profile Data Subjects. CV content is not evaluated without human involvement.",
          ],
        },
      ],
    },
    {
      heading: "5. Processors and transfers",
      body: [
        "The Controller does not sell, rent or transfer personal data to third parties for marketing purposes. To operate the service the following processors are engaged, each under a data processing agreement (DPA) pursuant to Article 28 GDPR.",
      ],
      list: [
        "Supabase Inc. — database hosting and user authentication. Accounts and CV data are stored in a database hosted in the European Union, in Amazon Web Services' Ireland (eu-west-1) region. Supabase is a US-established provider; the agreement relies on the EU Standard Contractual Clauses (SCC) and the EU–US Data Privacy Framework (DPF). Privacy notice: supabase.com/privacy",
        "Vercel Inc. — hosting and content delivery (edge network) for the App. Vercel is a US-established provider; transfers rely on its DPA and the EU Standard Contractual Clauses (SCC). Privacy notice: vercel.com/legal/privacy-policy",
        "The registration confirmation e-mail is sent by Supabase's built-in authentication e-mail service, solely for delivering that message.",
      ],
      subsections: [
        {
          heading: "5.1. Transfers outside the European Economic Area",
          body: [
            "The hosting and database providers are US companies, so the relationship involves a transfer outside the EEA. The legal basis is an adequacy decision under Article 45 GDPR where the provider is certified under the EU–US Data Privacy Framework, and otherwise the Standard Contractual Clauses adopted by the European Commission under Article 46 GDPR, with supplementary safeguards.",
            "The physical storage of account and CV data takes place within the European Union (Ireland).",
          ],
        },
        {
          heading: "5.2. Requests by authorities",
          body: [
            "The Controller discloses personal data to third parties only where required by law, in response to a legally founded request from an authority or court.",
          ],
        },
      ],
    },
    {
      heading: "6. Retention",
      list: [
        "Account data and CV content: for as long as the account exists. Deletion can be requested by e-mail at any time; it is carried out within 30 days of the request unless a legal rule requires longer retention.",
        "After deletion, data disappears permanently from backups within a further 30 days at the latest.",
        "Technical logs (IP address, browser data): for the short period needed for secure operation, typically a few days, in line with the hosting provider's logging practice.",
        "Session cookie: until the browser is closed or the session expires, at most for the validity of the sign-in.",
        "Where consent is withdrawn for a given processing operation, that data is deleted within 30 days of the withdrawal.",
      ],
    },
    {
      heading: "7. Security measures",
      body: [
        "The Controller applies appropriate technical and organisational measures under Article 32 GDPR, in particular:",
      ],
      list: [
        "encrypted (HTTPS/TLS) connections for all traffic;",
        "row-level security (RLS) in the database: each user can access only their own CVs and profile, other users' data is not reachable;",
        "passwords stored only as irreversible hashes in Supabase's authentication system;",
        "encryption of the database at rest;",
        "data stored within the European Union;",
        "least-privilege access and regular security updates.",
      ],
      body2: [
        "Personal data breaches (e.g. unauthorised access or data loss) are handled under Articles 33–34 GDPR: the Controller notifies the Hungarian supervisory authority (NAIH) without undue delay and, where feasible, within 72 hours, and informs Data Subjects where the breach is likely to result in a high risk to their rights.",
      ],
    },
    {
      heading: "8. Your rights and how to exercise them",
      body: [
        "Under Articles 15–22 GDPR the Data Subject has the following rights, exercisable free of charge.",
      ],
      list: [
        "Right of access (Art. 15): to be informed whether personal data concerning you is processed, and to receive that data and details of the processing;",
        "Right to rectification (Art. 16): correction of inaccurate data and completion of incomplete data — CV content can also be edited directly in the editor;",
        "Right to erasure (Art. 17): deletion of your account and its data (\"right to be forgotten\");",
        "Right to restriction of processing (Art. 18), for example while the accuracy of data is contested;",
        "Right to data portability (Art. 20): to receive the data you provided in a structured, commonly used, machine-readable format (e.g. JSON or PDF), or to have it transmitted to another controller;",
        "Right to object (Art. 21): to object to processing based on legitimate interests; the Controller may continue only where compelling legal grounds exist;",
        "Right to withdraw consent at any time, without giving reasons; withdrawal does not affect the lawfulness of prior processing.",
      ],
      subsections: [
        {
          heading: "8.1. How to exercise your rights",
          body: [
            "Requests should be sent to contact@andrasdenes.com. The Controller responds without undue delay and in any event within 30 days of receipt. Where a request is complex, the Controller will inform you within that period and may extend it by up to two further months with reasons.",
            "To prevent abuse, identity may be verified before the request is fulfilled (for example by writing from the account's e-mail address).",
          ],
        },
        {
          heading: "8.2. Remedies",
          body: [
            "If your rights are infringed you may lodge a complaint with the Hungarian National Authority for Data Protection and Freedom of Information (NAIH), and you may also bring the matter before a court.",
            "NAIH: 1055 Budapest, Falk Miksa utca 9–11.; postal address: 1363 Budapest, Pf. 9.; phone: +36 1 391 1400; e-mail: ugyfelszolgalat@naih.hu; web: www.naih.hu",
            "A complaint to NAIH is not a precondition for going to court; proceedings may be brought before the court of your residence or place of stay.",
          ],
        },
      ],
    },
    {
      heading: "9. Cookies and browser local storage",
      body: [
        "The App uses only cookies that are strictly necessary for it to work. No marketing or analytics cookies are set, so no cookie consent is required (strictly necessary cookies need no consent under the GDPR and the Ekertv.).",
      ],
      list: [
        "Session cookie (Supabase authentication cookie, prefixed \"sb-\"): needed to keep you signed in and to identify the account. Lifetime is the session. It is not created for visitors who are not signed in.",
        "Browser local storage (localStorage — not a cookie, never transmitted): demo-mode data, an uploaded profile photo, and custom language settings. This data stays on your device only and is removed when you clear the browser's data.",
        "The App uses no third-party trackers, social plug-ins or advertising identifiers. Fonts are served from the App's own host, not an external provider.",
      ],
      body2: [
        "You can change cookie handling in your browser settings at any time; blocking the session cookie prevents sign-in and therefore CV editing.",
      ],
    },
    {
      heading: "10. Children",
      body: [
        "The App does not allow self-registration by persons under 16. Under Article 8 GDPR and the Infotv., processing the personal data of a person under 16 requires the consent of the holder of parental responsibility. If the Controller learns that a person under 16 created an account without such consent, the account and its data are deleted.",
      ],
    },
    {
      heading: "11. Changes to this notice",
      body: [
        "The Controller may amend this notice if the processing changes or the law requires it. The version in force is always available in the App on this page, with its effective date.",
        "Where a change materially affects the Data Subject's rights or the circumstances of processing, registered users are informed in advance by e-mail or by a notice in the App.",
      ],
    },
    {
      heading: "12. Contact",
      body: [
        "For any question, request or complaint about data processing:",
        "András Dénes — e-mail: contact@andrasdenes.com",
        "The Controller answers within 30 days at the latest.",
      ],
    },
  ],
  footerNote:
    "This notice serves the information obligation under Articles 13–14 GDPR. It is not legal advice; a professional legal review is recommended before any material change in processing.",
};

const CONTENT: Record<"hu" | "en", Content> = { hu: HU, en: EN };

function Block({
  heading,
  body,
  list,
  body2,
  subsections,
}: {
  heading: string;
  body?: string[];
  list?: string[];
  body2?: string[];
  subsections?: { heading: string; body?: string[]; list?: string[] }[];
}) {
  return (
    <section className="mb-10">
      <h2 className="text-lg sm:text-xl font-semibold text-stone-900 mb-3">{heading}</h2>
      {body?.map((p, i) => (
        <p key={i} className="text-sm sm:text-[15px] leading-relaxed text-stone-700 mb-3">
          {p}
        </p>
      ))}
      {list && (
        <ul className="space-y-2 mb-3 pl-0 list-none">
          {list.map((item, i) => (
            <li
              key={i}
              className="text-sm sm:text-[15px] leading-relaxed text-stone-700 pl-4 border-l-2 border-stone-200"
            >
              {item}
            </li>
          ))}
        </ul>
      )}
      {body2?.map((p, i) => (
        <p key={`t${i}`} className="text-sm sm:text-[15px] leading-relaxed text-stone-700 mb-3">
          {p}
        </p>
      ))}
      {subsections?.map((sub, i) => (
        <div key={i} className="mt-5">
          <h3 className="text-[15px] font-semibold text-stone-800 mb-2">{sub.heading}</h3>
          {sub.body?.map((p, j) => (
            <p key={j} className="text-sm sm:text-[15px] leading-relaxed text-stone-700 mb-3">
              {p}
            </p>
          ))}
          {sub.list && (
            <ul className="space-y-2 mb-3 list-none">
              {sub.list.map((item, k) => (
                <li
                  key={k}
                  className="text-sm sm:text-[15px] leading-relaxed text-stone-700 pl-4 border-l-2 border-stone-200"
                >
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}

export default async function PrivacyPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const params = await searchParams;
  const lang: "hu" | "en" = params?.lang === "en" ? "en" : "hu";
  const c = CONTENT[lang];

  return (
    <main
      className="h-full overflow-y-auto bg-stone-100"
      lang={lang}
    >
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
        <div className="flex items-center justify-between gap-4 mb-8">
          <Link
            href="/"
            className="text-sm text-stone-500 hover:text-stone-800 transition-colors"
          >
            ← {c.back}
          </Link>
          <Link
            href={c.otherLangHref}
            className="text-sm text-teal-700 hover:text-teal-800 underline underline-offset-2"
          >
            {c.otherLangLabel}
          </Link>
        </div>

        <header className="mb-10 pb-6 border-b border-stone-200">
          <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight">
            {c.title}
          </h1>
          <p className="text-sm text-stone-500 mt-2">{c.subtitle}</p>
          <p className="text-xs text-stone-400 mt-1">
            {c.effective} · {c.version}
          </p>
        </header>

        <article>
          {c.sections.map((s) => (
            <Block key={s.heading} {...s} />
          ))}
        </article>

        <footer className="pt-6 border-t border-stone-200">
          <p className="text-xs leading-relaxed text-stone-400">{c.footerNote}</p>
          <Link
            href="/"
            className="inline-block mt-6 text-sm text-stone-500 hover:text-stone-800 transition-colors"
          >
            ← {c.back}
          </Link>
        </footer>
      </div>
    </main>
  );
}
