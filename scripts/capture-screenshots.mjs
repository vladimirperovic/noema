import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "data");
const OUTPUT_DIR = path.join(ROOT, "docs", "screenshots");
const PUBLIC_DIR = path.join(ROOT, "public");
const SERVER_ENTRY = path.join(ROOT, "src", "index.js");
const HOST = "127.0.0.1";

const cleanRoutes = new Map([
  ["index.html", { route: "/", name: "home" }],
  ["archive.html", { route: "/arhiva", name: "archive" }],
  ["notes.html", { route: "/notes", name: "notes" }],
  ["documents.html", { route: "/documents", name: "documents" }],
  ["links.html", { route: "/links", name: "links" }],
  ["ai-projects.html", { route: "/ai-projects", name: "ai-projects" }],
  ["inspiration.html", { route: "/inspiration", name: "inspiration" }],
  ["buildingsite.html", { route: "/buildingsite", name: "building-sites" }],
  ["backup.html", { route: "/backup", name: "backup" }],
  ["help.html", { route: "/help", name: "help" }],
  ["stats.html", { route: "/stats", name: "stats" }],
]);

const screenshotTranslations = new Map([
  ["Noema — juče · danas · sjutra", "Noema — yesterday · today · tomorrow"],
  ["Nije podešeno. Add GOOGLE_CLIENT_ID i GOOGLE_CLIENT_SECRET u .env.", "Not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env."],
  ["Prevuci dugme ispod u bookmarks/favorites traku svog browsera (Safari, Firefox, Chrome — radi i na poslu na Windowsu). Kad ti se svidi neka stranica, samo klikni na njega: otvoriće se mali prozor i link je sačuvan ovdje, sa naslovom i slikom. U Safariju prečica ⌘1 – ⌘9 otvara bookmark po redosledu iz Favorites bara.", "Drag the button below to your browser’s bookmarks/favorites bar (Safari, Firefox, or Chrome — it also works on Windows). When you find a page you like, click it: a small window opens and the link is saved here with its title and image. In Safari, ⌘1–⌘9 opens bookmarks in Favorites-bar order."],
  ["Za iPhone/iPad (Instagram, Facebook aplikacije) postoji share-sheet prečica — uputstvo korak po korak je na help stranici.", "For iPhone/iPad (including Instagram and Facebook apps), a share-sheet shortcut is available — see the step-by-step guide on the Help page."],
  ["GA4, Google Search Console i PageSpeed podaci bez demo vrijednosti. Graf i tabela koriste identičnu dnevnu GA4 seriju.", "GA4, Google Search Console, and PageSpeed data without demo values. The chart and table use the same daily GA4 series."],
  ["Save projekte i slike koje želiš da imaš pri ruci tokom projektovanja.", "Save projects and images you want close at hand while designing."],
  ["Stranice koje su se pojavile u Google rezultatima u izabranom periodu", "Pages that appeared in Google results during the selected period"],
  ["Odaberi pojedinačni sajt u SEO grafiku da vidiš ključne riječi i rangiranje.", "Select one site in the SEO chart to view keywords and rankings."],
  ["Odaberi pojedinačni sajt u SEO grafiku za detalje.", "Select one site in the SEO chart for details."],
  ["Svi projekti · 7d · zbirna raspodjela posjeta po kanalima", "All projects · 7d · combined visit distribution by channel"],
  ["Nema podataka o izvorima saobraćaja za izabrani period.", "No traffic-source data is available for the selected period."],
  ["Za zbir svih projekata nema jedinstvene liste ključnih riječi.", "There is no single keyword list for the combined projects."],
  ["Stvarne dnevne vrijednosti direktno iz Google Search Console API-ja.", "Real daily values directly from the Google Search Console API."],
  ["Vikend je naglašen · zbir koristi iste tačke kao graf", "Weekends are highlighted · the total uses the same points as the chart"],
  ["Za izabrani projekat nema dnevne GSC serije.", "No daily GSC series is available for the selected project."],
  ["Dnevni GA4 trend trenutno nije dostupan.", "The daily GA4 trend is currently unavailable."],
  ["Za tabelu nema potvrđene dnevne serije.", "No confirmed daily series is available for the table."],
  ["GA4 posjete · posljednjih 7 dostupnih dana", "GA4 visits · last 7 available days"],
  ["Izvori posjeta (Odakle su došli posjetioci)", "Visit sources (where visitors came from)"],
  ["isprekidana vertikala i markeri prate kursor", "the dashed vertical line and markers follow the cursor"],
  ["Izaberi bilješku sa lijeve strane ili napravi novu.", "Select a note on the left or create a new one."],
  ["Search naslove, opise, adrese i labele...", "Search titles, descriptions, addresses, and labels..."],
  ["Search projekte, adrese, oznake...", "Search projects, addresses, and labels..."],
  ["Search nazivi, ulicu, labelu ili link...", "Search names, streets, labels, or links..."],
  ["prevuci u bookmarks traku (ne klikći ovdje)", "drag to the bookmarks bar (do not click here)"],
  ["Pošalji s bilo kog računara — bookmarklet", "Send from any computer — bookmarklet"],
  ["ARHITEKTONSKE REFERENCE", "ARCHITECTURAL REFERENCES"],
  ["SOURCE SAOBRAĆAJA (CHANNEL / SOURCE)", "TRAFFIC SOURCE (CHANNEL / SOURCE)"],
  ["Nema potvrđenih GSC podataka", "No confirmed GSC data"],
  ["Nema konfigurisanih projekata", "No projects configured"],
  ["Nema konfiguriranih projekata", "No projects configured"],
  ["Google kalendar nije povezan", "Google Calendar is not connected"],
  ["Poveži Google kalendar", "Connect Google Calendar"],
  ["Danas nema događaja", "No events today"],
  ["Često postavljana pitanja", "Frequently asked questions"],
  ["Kako koristiti Noemu", "How to use Noema"],
  ["Ova stranica ne postoji.", "This page does not exist."],
  ["Stranica nije pronađena", "Page not found"],
  ["Nazad na početnu", "Back to home"],
  ["Prostor za skladištenje", "Storage"],
  ["Posljednji snapshot", "Latest snapshot"],
  ["Poslednji snapshot", "Latest snapshot"],
  ["Nema snapshotova", "No snapshots"],
  ["Nema snimaka", "No snapshots"],
  ["Preuzmi arhivu", "Download archive"],
  ["Napravi snapshot", "Create snapshot"],
  ["Napravi snimak", "Create snapshot"],
  ["Vrati snapshot", "Restore snapshot"],
  ["Vrati snimak", "Restore snapshot"],
  ["Izvoz podataka", "Export data"],
  ["Uvoz podataka", "Import data"],
  ["Pročitati MCP specifikaciju", "Read the MCP specification"],
  ["Poslati izveštaj klijentu", "Send the report to the client"],
  ["Pregledati pull requestove", "Review pull requests"],
  ["Pripremiti demo za klijenta", "Prepare a demo for the client"],
  ["Sastanak sa timom u 10h", "Team meeting at 10:00"],
  ["Ništa nije preostalo.", "Nothing left over."],
  ["Čisto. Dodaj prvi task iznad.", "Clear. Add the first task above."],
  ["Još prazno za sjutra.", "Still empty for tomorrow."],
  ["1 projekata u kolekciji.", "1 project in the collection."],
  ["Add novi AI projekat", "Add a new AI project"],
  ["Prikaz u tabeli", "Table view"],
  ["Podijeli galerije", "Share galleries"],
  ["Gallery + mapa", "Gallery + map"],
  ["1 sačuvanih linkova", "1 saved link"],
  ["Nalijepi link (https://...)", "Paste a link (https://...)"],
  ["labela (optional)", "label (optional)"],
  ["SEO — svi projekti · 7-dnevni prikaz", "SEO — all projects · 7-day view"],
  ["SEO detalji po sajtu", "SEO details by site"],
  ["Top landing stranice", "Top landing pages"],
  ["Visits po projektima", "Visits by project"],
  ["Učinak po uređaju", "Performance by device"],
  ["Odaberi sajt.", "Select a site."],
  ["Juče", "Yesterday"],
  ["Danas", "Today"],
  ["danas", "today"],
  ["Sjutra", "Tomorrow"],
  ["Sutra", "Tomorrow"],
  ["sjutra", "tomorrow"],
  ["prošli dan", "previous day"],
  ["naredni dan", "next day"],
  ["misao na dohvat ruke", "thought within reach"],
  ["Resursi servera", "Server resources"],
  ["Početna", "Home"],
  ["Naslovna", "Home"],
  ["Arhiva", "Archive"],
  ["Bilješke", "Notes"],
  ["Beleške", "Notes"],
  ["Napomene", "Notes"],
  ["Dokumenti", "Documents"],
  ["Linkovi", "Links"],
  ["AI projekti", "AI Projects"],
  ["AI Projekti", "AI Projects"],
  ["Inspiracija", "Inspiration"],
  ["Gradilišta", "Building Sites"],
  ["Gradilište", "Building Site"],
  ["Rezervne kopije", "Backups"],
  ["Sigurnosne kopije", "Backups"],
  ["Statistika", "Stats"],
  ["Pomoć", "Help"],
  ["Podešavanja", "Settings"],
  ["Postavke", "Settings"],
  ["Odjava", "Log out"],
  ["Odjavi se", "Log out"],
  ["Prijava", "Log in"],
  ["Prijavi se", "Log in"],
  ["Lozinka", "Password"],
  ["Unesite lozinku", "Enter password"],
  ["Pogrešna lozinka", "Incorrect password"],
  ["Nova obaveza", "New task"],
  ["Dodaj obavezu", "Add task"],
  ["Dodaj u", "Add to"],
  ["Dodaj obavezu…", "Add a task…"],
  ["Dodaj zadatak", "Add task"],
  ["Dodaj zadatak…", "Add a task…"],
  ["Unesi obavezu", "Enter a task"],
  ["Nema obaveza", "No tasks"],
  ["Nema zadataka", "No tasks"],
  ["otvorenih", "open"],
  ["otvoreno", "open"],
  ["završeno", "completed"],
  ["obaveza", "tasks"],
  ["zadatak", "task"],
  ["zadataka", "tasks"],
  ["Otvorene", "Open"],
  ["Otvoreno", "Open"],
  ["Završene", "Completed"],
  ["Završeno", "Completed"],
  ["Nezavršene", "Open"],
  ["Prioritet", "Priority"],
  ["Visok", "High"],
  ["Srednji", "Medium"],
  ["Nizak", "Low"],
  ["Bez prioriteta", "No priority"],
  ["Vrijeme", "Time"],
  ["Vreme", "Time"],
  ["Ponavljanje", "Repeat"],
  ["Svaki dan", "Every day"],
  ["Svake sedmice", "Every week"],
  ["Svakog mjeseca", "Every month"],
  ["Sačuvaj", "Save"],
  ["Snimi", "Save"],
  ["Otkaži", "Cancel"],
  ["Dodaj", "Add"],
  ["Uredi", "Edit"],
  ["Izmijeni", "Edit"],
  ["Izmeni", "Edit"],
  ["Obriši", "Delete"],
  ["Izbriši", "Delete"],
  ["Zatvori", "Close"],
  ["Otvori", "Open"],
  ["Sakrij", "Hide"],
  ["Prikaži", "Show"],
  ["Vrati", "Restore"],
  ["Pretraži", "Search"],
  ["Pretraga", "Search"],
  ["Pretraži arhivu", "Search archive"],
  ["Filtriraj", "Filter"],
  ["Filteri", "Filters"],
  ["Sve", "All"],
  ["SVI", "ALL"],
  ["Aktivno", "Active"],
  ["Arhivirano", "Archived"],
  ["Arhiviraj", "Archive"],
  ["Prikači", "Pin"],
  ["Otkači", "Unpin"],
  ["Oznaka", "Label"],
  ["Oznake", "Labels"],
  ["Bez oznake", "No label"],
  ["Naslov", "Title"],
  ["Opis", "Description"],
  ["Sadržaj", "Content"],
  ["Adresa", "Address"],
  ["Lokacija", "Location"],
  ["Izvor", "Source"],
  ["izvor", "source"],
  ["Slike", "Images"],
  ["Fotografije", "Photos"],
  ["Dokumentacija", "Documentation"],
  ["Nova bilješka", "New note"],
  ["Nova beleška", "New note"],
  ["Novi dokument", "New document"],
  ["Novi link", "New link"],
  ["Nova inspiracija", "New inspiration"],
  ["Novo gradilište", "New building site"],
  ["Novi AI projekat", "New AI project"],
  ["Novi AI projekt", "New AI project"],
  ["Dodaj sliku", "Add image"],
  ["Dodaj fotografije", "Add photos"],
  ["Izaberi datoteke", "Choose files"],
  ["Odaberi datoteke", "Choose files"],
  ["Nema bilješki", "No notes"],
  ["Nema beleški", "No notes"],
  ["Nema dokumenata", "No documents"],
  ["Nema linkova", "No links"],
  ["Nema inspiracije", "No inspiration items"],
  ["Nema gradilišta", "No building sites"],
  ["Kalendar", "Calendar"],
  ["Događaji", "Events"],
  ["Nema događaja", "No events"],
  ["Ukupno", "Total"],
  ["Podaci", "Data"],
  ["Mediji", "Media"],
  ["Posjete", "Visits"],
  ["Korisnici", "Users"],
  ["Pregledi", "Views"],
  ["Klikovi", "Clicks"],
  ["Prikazi", "Impressions"],
  ["Prosječna pozicija", "Average position"],
  ["Prosečna pozicija", "Average position"],
  ["Performanse", "Performance"],
  ["Brzina stranice", "Page speed"],
  ["Vodič", "Guide"],
  ["Brzi početak", "Quick start"],
  ["Integracije", "Integrations"],
  ["Prečice", "Shortcuts"],
  ["Povezano", "Connected"],
  ["Nije povezano", "Not connected"],
  ["Nedostupno", "Unavailable"],
  ["Učitavanje…", "Loading…"],
  ["Učitavanje", "Loading"],
  ["Greška", "Error"],
  ["Pokušaj ponovo", "Try again"],
  ["Potvrdi", "Confirm"],
  ["Da", "Yes"],
  ["Ne", "No"],
  ["OBAVEZA", "TASK"],
  ["DOKUMENT", "DOCUMENT"],
  ["BILJEŠKA", "NOTE"],
  ["Mapa", "Map"],
  ["1 projekata", "1 project"],
  ["1 slika", "1 image"],
  ["1 kolekcija", "1 collection"],
  ["RASPORED", "LAYOUT"],
  ["2 KOL.", "2 COL."],
  ["LABELE", "LABELS"],
  ["HASHTAGOVI", "HASHTAGS"],
  ["Podijeli", "Share"],
  ["Najnoviji", "Newest"],
  ["Grupiši", "Group"],
  ["Izvezi", "Export"],
  ["Open sve", "Open all"],
  ["Označi", "Select"],
  ["0 označenih", "0 selected"],
  ["ios prečica", "iOS shortcut"],
  ["provjereno", "checked"],
  ["podaci kroz", "data through"],
  ["LIVE PROJEKTI", "LIVE PROJECTS"],
  ["PROJEKAT", "PROJECT"],
  ["DATA KROZ", "DATA THROUGH"],
  ["Svi projekti", "All projects"],
  ["LANDING STRANICA", "LANDING PAGE"],
  ["UREĐAJ", "DEVICE"],
  ["UČEŠĆE (%)", "SHARE (%)"],
  ["SAJT", "SITE"],
  ["srijeda", "Wednesday"],
  ["nedelja", "Sunday"],
  ["ponedeljak", "Monday"],
  ["utorak", "Tuesday"],
  ["sreda", "Wednesday"],
  ["četvrtak", "Thursday"],
  ["petak", "Friday"],
  ["subota", "Saturday"],
  ["pon", "Mon"],
  ["uto", "Tue"],
  ["sri", "Wed"],
  ["čet", "Thu"],
  ["pet", "Fri"],
  ["sub", "Sat"],
  ["ned", "Sun"],
  ["jan", "Jan"],
  ["feb", "Feb"],
  ["mar", "Mar"],
  ["apr", "Apr"],
  ["avg", "Aug"],
  ["sep", "Sep"],
  ["okt", "Oct"],
  ["nov", "Nov"],
  ["dec", "Dec"],
  ["januar", "January"],
  ["februar", "February"],
  ["mart", "March"],
  ["april", "April"],
  ["maj", "May"],
  ["jun", "June"],
  ["jul", "July"],
  ["avgust", "August"],
  ["septembar", "September"],
  ["oktobar", "October"],
  ["novembar", "November"],
  ["decembar", "December"],
  ["linkova", "links"],
  ["dokumenata", "documents"],
]);

async function configureEnglishScreenshotPage(page) {
  await page.addInitScript(() => {
    const forceEnglishLocale = (locales) => {
      if (typeof locales === "string" && /^(sr|bs|hr|me)(-|$)/i.test(locales)) return "en-GB";
      if (Array.isArray(locales)) {
        const filtered = locales.filter((locale) => !(typeof locale === "string" && /^(sr|bs|hr|me)(-|$)/i.test(locale)));
        return filtered.length ? filtered : ["en-GB"];
      }
      return locales;
    };

    const OriginalDateTimeFormat = Intl.DateTimeFormat;
    const EnglishDateTimeFormat = function (locales, options) {
      return new OriginalDateTimeFormat(forceEnglishLocale(locales), options);
    };
    Object.setPrototypeOf(EnglishDateTimeFormat, OriginalDateTimeFormat);
    EnglishDateTimeFormat.prototype = OriginalDateTimeFormat.prototype;
    Intl.DateTimeFormat = EnglishDateTimeFormat;

    for (const method of ["toLocaleDateString", "toLocaleString", "toLocaleTimeString"]) {
      const original = Date.prototype[method];
      Date.prototype[method] = function (locales, options) {
        return original.call(this, forceEnglishLocale(locales), options);
      };
    }
  });
}

async function translatePageForScreenshot(page) {
  const translations = Array.from(screenshotTranslations.entries()).sort((a, b) => b[0].length - a[0].length);
  await page.evaluate((entries) => {
    const replacements = entries.map(([source, target]) => ({
      target,
      pattern: new RegExp(`(?<![\\p{L}\\p{N}])${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "gu"),
    }));

    const translate = (value) => {
      if (!value || typeof value !== "string") return value;
      let output = value;
      for (const { pattern, target } of replacements) output = output.replace(pattern, target);
      return output;
    };

    document.documentElement.lang = "en";
    document.title = translate(document.title);

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
        return node.nodeValue?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });

    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    for (const node of textNodes) node.nodeValue = translate(node.nodeValue);

    for (const element of document.querySelectorAll("[placeholder], [title], [aria-label], input[value], button[value]")) {
      for (const attribute of ["placeholder", "title", "aria-label", "value"]) {
        if (!element.hasAttribute(attribute)) continue;
        element.setAttribute(attribute, translate(element.getAttribute(attribute)));
      }
    }
  }, translations);
}

async function assertCleanDataDirectory() {
  if (!existsSync(DATA_DIR)) return;
  const entries = await readdir(DATA_DIR);
  if (entries.length > 0) {
    throw new Error(
      "Refusing to generate screenshots because data/ is not empty. " +
      "Run this only in a clean checkout; screenshots must never use personal data.",
    );
  }
}

async function waitForHealth(baseUrl, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Noema exited with code ${child.exitCode}.`);
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Noema did not become healthy at ${baseUrl}.`);
}

async function startServer(port, uiPassword = "") {
  const baseUrl = `http://${HOST}:${port}`;
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      HOST,
      PORT: String(port),
      PUBLIC_BASE_URL: baseUrl,
      NODE_ENV: "test",
      NOEMA_TIMEZONE: "UTC",
      NOEMA_CORS_ORIGIN: baseUrl,
      NOEMA_API_TOKEN: "screenshot-demo-token",
      ENCRYPTION_KEY: "screenshot-demo-encryption-key-not-for-production",
      UI_PASSWORD: uiPassword,
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      GOOGLE_REFRESH_TOKEN: "",
      GA4_CLIENT_EMAIL: "",
      GA4_PRIVATE_KEY: "",
      PAGESPEED_API_KEY: "",
      NOEMA_ANALYTICS_PROJECTS: "",
    },
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  child.stdout.on("data", (chunk) => process.stdout.write(`[noema] ${chunk}`));
  await waitForHealth(baseUrl, child).catch((error) => {
    throw new Error(`${error.message}\n${stderr}`);
  });
  return { child, baseUrl };
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function api(baseUrl, route, body) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${route} returned ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function makeDemoImage(browser, title, subtitle) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.setContent(`<!doctype html>
    <style>
      html,body{margin:0;width:100%;height:100%;font-family:Arial,sans-serif;background:#e8e5df;color:#202020}
      main{height:100%;display:grid;place-items:center;background:linear-gradient(135deg,#d7d2c8,#f7f5f1)}
      section{width:72%;border:1px solid rgba(0,0,0,.18);padding:72px;background:rgba(255,255,255,.58);box-shadow:0 30px 90px rgba(0,0,0,.08)}
      h1{font-size:72px;font-weight:400;letter-spacing:-3px;margin:0 0 18px}
      p{font-size:28px;line-height:1.4;margin:0;color:#606060}
    </style>
    <main><section><h1>${title}</h1><p>${subtitle}</p></section></main>`);
  const original = await page.screenshot({ type: "jpeg", quality: 88 });
  await page.setViewportSize({ width: 640, height: 420 });
  const thumbnail = await page.screenshot({ type: "jpeg", quality: 80 });
  await page.close();
  return {
    name: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.jpg`,
    type: "image/jpeg",
    data: original.toString("base64"),
    thumbnailData: thumbnail.toString("base64"),
  };
}

async function seedNeutralDemo(baseUrl, browser) {
  await api(baseUrl, "/api/notes", {
    title: "Review checklist",
    body: "Confirm scope\nPrepare questions\nRecord the decision",
    labels: ["demo", "workflow"],
    pinned: true,
    archived: false,
  });

  await api(baseUrl, "/api/documents", {
    title: "Project brief",
    body: "<h2>Purpose</h2><p>This neutral document demonstrates the long-form workspace.</p><h2>Next step</h2><p>Adapt the module to your own domain.</p>",
    label: "demo",
  });

  await api(baseUrl, "/api/links", {
    url: "https://example.com/reference",
    title: "Example reference",
    description: "A neutral saved link used only for public screenshots.",
    label: "research",
    image: "",
  });

  await api(baseUrl, "/api/ai-projects", {
    url: "https://example.com/experiment",
    title: "Prototype experiment",
    description: "An example collection item that can be renamed or repurposed.",
    label: "prototype",
    image: "",
  });

  const inspirationImage = await makeDemoImage(browser, "Material study", "Neutral demo content for the Inspiration module");
  await api(baseUrl, "/api/inspirations", {
    title: "Material and light",
    sourceUrl: "https://example.com/inspiration",
    address: "Example location",
    label: "materials",
    images: [inspirationImage],
  });

  const siteImage = await makeDemoImage(browser, "Field record", "Building Sites can be adapted to any location-based photo journal");
  await api(baseUrl, "/api/buildingsites", {
    title: "Example field visit",
    location: "Sample project",
    address: "Example address",
    documentUrl: "https://example.com/documentation",
    label: "inspection",
    tags: ["demo", "progress", "location"],
    images: [siteImage],
  });

  await api(baseUrl, "/api/backup/snapshot", {});
}

async function discoverPages() {
  const htmlFiles = (await readdir(PUBLIC_DIR)).filter((file) => file.endsWith(".html"));
  const pages = [];
  for (const file of htmlFiles) {
    if (file === "login.html" || file === "404.html") continue;
    const known = cleanRoutes.get(file);
    if (known) pages.push(known);
    else pages.push({ route: `/${file}`, name: file.replace(/\.html$/, "").replace(/[^a-z0-9-]+/gi, "-").toLowerCase() });
  }
  pages.sort((a, b) => a.name === "home" ? -1 : b.name === "home" ? 1 : a.name.localeCompare(b.name));
  pages.push({ route: "/this-page-does-not-exist", name: "404" });
  return pages;
}

async function capturePage(page, url, output) {
  const response = await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  if (!response) throw new Error(`No response for ${url}`);
  await page.waitForTimeout(700);
  await translatePageForScreenshot(page);
  await page.waitForTimeout(100);
  await page.screenshot({ path: output, fullPage: true });
  console.log(`captured ${path.relative(ROOT, output)}`);
}

async function main() {
  await assertCleanDataDirectory();
  await mkdir(OUTPUT_DIR, { recursive: true });
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  let server;
  try {
    server = await startServer(3000);
    await seedNeutralDemo(server.baseUrl, browser);

    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
      locale: "en-GB",
    });
    const page = await context.newPage();
    await configureEnglishScreenshotPage(page);
    for (const item of await discoverPages()) {
      await capturePage(page, `${server.baseUrl}${item.route}`, path.join(OUTPUT_DIR, `${item.name}.png`));
    }
    await context.close();
    await stopServer(server.child);

    server = await startServer(3010, "public-screenshot-demo-password");
    const loginContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
      locale: "en-GB",
    });
    const loginPage = await loginContext.newPage();
    await configureEnglishScreenshotPage(loginPage);
    await capturePage(loginPage, `${server.baseUrl}/login`, path.join(OUTPUT_DIR, "login.png"));
    await loginContext.close();
  } finally {
    await stopServer(server?.child);
    await browser.close();
    await rm(DATA_DIR, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
