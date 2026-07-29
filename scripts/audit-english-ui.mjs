import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots = ["public", "src", "scripts"];
const allowed = new Set([".html", ".js", ".mjs", ".json"]);
const marker = /[čćžšđČĆŽŠĐ]|\b(?:juče|jučer|jucer|danas|sjutra|sutra|zadatak|zadaci|bilješk\w*|biljesk\w*|arhiva|gradilišt\w*|gradilist\w*|inspiracij\w*|sačuv\w*|sacuv\w*|otkaži|otkazi|dodaj|obriši|obrisi|uredi|izbriši|izbrisi|pretraži|pretrazi|prikaži|prikazi|zatvori|otvori|nazad|naprijed|greška|greska|uspješno|uspesno|učit\w*|ucit\w*|osvježi|osveži|osvezi|preuzmi|kopiraj|lozinka|prijava|odjava|odjavi|uvoz|izvoz|napomena|vrijeme|vreme|datum|lokacija|adresa|oznaka|etiketa|naslov|opis|slika|slike|izaberi|izaberite|dodavanje|uređivanje|uredjivanje|potvrdi|poništi|ponisti|resursi|poveži|povezi|povezano|nepovezano|postavke|širina|sirina|svijetl\w*|svet\w*|tamn\w*|otpremi|servis|nije|nema|može|moze|samo|sve|svih|stranica|stranice|dostupan|dostupna|trenutno|odabrano|odabrani|odabrane|obavezno|uspjelo|uspelo|obnovi|ponovo|dodano|uklonjeno|završeno|zavrseno)\b/giu;

async function walk(dir) {
  const output = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) output.push(...await walk(full));
    else if (allowed.has(path.extname(entry.name))) output.push(full);
  }
  return output;
}

const findings = [];
for (const root of roots) {
  const base = path.join(ROOT, root);
  for (const file of await walk(base)) {
    if (file.endsWith("audit-english-ui.mjs")) continue;
    const text = await readFile(file, "utf8");
    text.split(/\r?\n/).forEach((line, index) => {
      marker.lastIndex = 0;
      if (marker.test(line)) findings.push(`${path.relative(ROOT, file)}:${index + 1}: ${line.trim()}`);
    });
  }
}

console.log(findings.join("\n"));
console.error(`Found ${findings.length} possible Serbian UI/source lines.`);
process.exitCode = findings.length ? 2 : 0;
