/* Noema runtime English localization. Keeps user-created content unchanged. */
(() => {
  "use strict";

  const translations = new Map([
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
  const extraTranslations = new Map([
    ["Servis za adrese trenutno nije dostupan.", "The address service is currently unavailable."],
    ["Naslov je obavezan.", "A title is required."],
    ["URL je obavezan.", "A URL is required."],
    ["Naziv je obavezan.", "A name is required."],
    ["Neispravan JSON format.", "Invalid JSON format."],
    ["Pristup zaštićen lozinkom. Prijavite se na /login", "Password-protected access. Log in at /login."],
    ["Interna greška servera.", "Internal server error."],
    ["Nije moguće automatski izvući tekst sa ove stranice.", "Text could not be extracted from this page automatically."],
    ["Nevažeći URL.", "Invalid URL."],
  ]);
  for (const [source, target] of extraTranslations) translations.set(source, target);

  const forceEnglishLocale = (locales) => {
    if (typeof locales === "string" && /^(sr|bs|hr|me)(-|$)/i.test(locales)) return "en-GB";
    if (Array.isArray(locales)) {
      const filtered = locales.filter((locale) => !(typeof locale === "string" && /^(sr|bs|hr|me)(-|$)/i.test(locale)));
      return filtered.length ? filtered : ["en-GB"];
    }
    return locales || "en-GB";
  };

  if (!window.__noemaEnglishLocalePatched) {
    window.__noemaEnglishLocalePatched = true;
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
  }

  const replacements = Array.from(translations.entries())
    .sort((a, b) => b[0].length - a[0].length)
    .map(([source, target]) => ({
      target,
      pattern: new RegExp(`(?<![\\p{L}\\p{N}])${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "gu"),
    }));

  const USER_CONTENT_SELECTOR = [
    "[data-noema-i18n-skip]",
    "[contenteditable='true']",
    ".task-title", ".subtask-text", ".subtask-title",
    ".note-title", ".note-body", ".note-content",
    ".document-title", ".document-body", ".document-content", ".doc-title", ".doc-body",
    ".link-title", ".link-description", ".reader-content",
    ".inspiration-title", ".inspiration-address",
    ".site-title", ".site-address", ".site-location", ".hotspot-title",
    ".editor", ".editor-content", ".ProseMirror", ".ql-editor",
    "textarea:not([readonly])",
  ].join(",");

  function translate(value) {
    if (!value || typeof value !== "string") return value;
    let output = value;
    for (const { pattern, target } of replacements) output = output.replace(pattern, target);
    return output;
  }

  function isUserContent(element) {
    return Boolean(element && element.closest && element.closest(USER_CONTENT_SELECTOR));
  }

  function translateTextNode(node) {
    const parent = node.parentElement;
    if (!parent || ["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE"].includes(parent.tagName) || isUserContent(parent)) return;
    const translated = translate(node.nodeValue);
    if (translated !== node.nodeValue) node.nodeValue = translated;
  }

  function translateElement(element) {
    if (!(element instanceof Element)) return;
    if (!isUserContent(element)) {
      const attributes = ["placeholder", "title", "aria-label", "alt"];
      if (element.matches('input[type="button"], input[type="submit"], input[type="reset"], button[value]')) attributes.push("value");
      for (const attribute of attributes) {
        if (!element.hasAttribute(attribute)) continue;
        const current = element.getAttribute(attribute);
        const translated = translate(current);
        if (translated !== current) element.setAttribute(attribute, translated);
      }
    }

    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.nodeValue?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) translateTextNode(node);
  }

  function applyEnglishUi() {
    document.documentElement.lang = "en";
    document.title = translate(document.title);
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = translate(description.content);
    if (document.body) translateElement(document.body);
  }

  function start() {
    applyEnglishUi();
    if (!document.body) return;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          translateTextNode(mutation.target);
          continue;
        }
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
          else if (node.nodeType === Node.ELEMENT_NODE) translateElement(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
