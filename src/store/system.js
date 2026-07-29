import os from "node:os";
import { statfs } from "node:fs/promises";

/**
 * Sistemski metrici (CPU / RAM / Disk) servera na kojem Noema radi.
 *
 * Čita se direktno iz Node procesa — ne treba Coolify API. Vrijednosti
 * odražavaju HOST server (VPS koji Coolify pokreće). Napomene:
 *  - U Docker kontejneru `os.totalmem()` i CPU vide host, ne limit kontejnera.
 *  - Na Linuxu `os.freemem()` ne računa cache/buffer kao slobodno, pa "used"
 *    izgleda veće nego u npr. `htop` — dovoljno tačno za indikator u futeru.
 *
 * CPU % se računa iz delte os.cpus() vremena, uzorkovano u pozadini na 2s.
 * statfs nije dostupan na macOS/Windows, koristimo fallback.
 */

let prevCpu = sampleCpu();
let cpuPercent = 0;

const timer = setInterval(() => {
  const cur = sampleCpu();
  const idleDelta = cur.idle - prevCpu.idle;
  const totalDelta = cur.total - prevCpu.total;
  prevCpu = cur;
  cpuPercent = totalDelta > 0 ? Math.round((1 - idleDelta / totalDelta) * 100) : 0;
}, 2000);
timer.unref?.(); // ne drži proces u životu

function sampleCpu() {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    for (const t of Object.values(cpu.times)) total += t;
    idle += cpu.times.idle;
  }
  return { idle, total };
}

/** Vrati trenutne metrike. Disk se mjeri na disku gdje živi proces (cwd). */
export async function getSystemStats() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  let disk = null;
  try {
    const s = await statfs(process.cwd());
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize; // bavail = slobodno za ne-root korisnika
    const used = total - free;
    disk = {
      used,
      total,
      percent: total > 0 ? Math.round((used / total) * 100) : 0,
    };
  } catch (err) {
    // statfs nije dostupan na macOS/Windows - pokušaj fallback sa fs.statfsSync ako postoji
    try {
      const { statfsSync } = await import("node:fs");
      const s = statfsSync(process.cwd());
      const total = s.blocks * s.bsize;
      const free = s.bavail * s.bsize;
      const used = total - free;
      disk = {
        used,
        total,
        percent: total > 0 ? Math.round((used / total) * 100) : 0,
      };
    } catch {
      disk = null; // potpuno nemoguće dobiti disk info
    }
  }

  return {
    cpu: { percent: cpuPercent, cores: os.cpus().length },
    mem: {
      used: usedMem,
      total: totalMem,
      percent: totalMem > 0 ? Math.round((usedMem / totalMem) * 100) : 0,
    },
    disk,
  };
}

/** Zaustavi pozadinsko uzorkovanje (graceful shutdown). */
export function closeSystem() {
  clearInterval(timer);
}
