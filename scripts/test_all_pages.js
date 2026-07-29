import http from 'node:http';

const PAGES_TO_TEST = [
  { 
    path: '/', 
    title: 'Glavna Tabla (Todos & Kalendar)', 
    checks: ['class="board"', 'task-check', 'id="topTheme"', 'noema-header-footer.js'] 
  },
  { 
    path: '/ai-projects', 
    title: 'AI Projects (Kolekcija & Tabelarni prikaz)', 
    checks: ['id="viewToggle"', 'projects-table-wrap', 'projects-table'] 
  },
  { 
    path: '/buildingsite', 
    title: 'Building Sites (Vremenska linija & Fotografije)', 
    checks: ['id="photoStageWrapper"', 'id="viewerOverlay"', 'nav-prev', 'viewer-fullscreen'] 
  },
  { 
    path: '/inspiration', 
    title: 'Inspiration (Galerija & Albumi)', 
    checks: ['id="viewerOverlay"', 'id="thumbRail"', 'nav-next'] 
  },
  { 
    path: '/stats', 
    title: 'Stats & SEO (Live GA4, GSC & 7-Dnevna tabela)',
    checks: ['id="weeklySection"', 'id="projectChart"', 'weekly-table', 'Google Analytics 4', 'Google Search Console', 'id="detailLinksWidget"']
  },
  { 
    path: '/notes', 
    title: 'Notes (Bilješke)', 
    checks: ['class="wrap"', 'notes'] 
  },
  { 
    path: '/documents', 
    title: 'Documents (Dokumenti)', 
    checks: ['class="wrap"', 'document'] 
  },
  { 
    path: '/backup', 
    title: 'Backup & Restore (6 Kolekcija baze)', 
    checks: ['loadInfo()', 'buildingSites', 'inspirations'] 
  },
  { 
    path: '/help', 
    title: 'Help & Uputstvo', 
    checks: ['class="toc"', 'AI Projects', 'Building Site', 'Stats & SEO'] 
  },
];

const API_ENDPOINTS = [
  { path: '/api/todos', title: 'API Todos', jsonKey: 'todos' },
  { path: '/api/backup/info', title: 'API Backup Info (6 kolekcija)', jsonKey: 'buildingSites' },
  { path: '/api/system', title: 'API System Stats', jsonKey: 'cpu' },
  { path: '/api/stats', title: 'API Analytics & Search Console', jsonKey: 'seo' },
  { path: '/noema-header-footer.js', title: 'Zajednička skripta Header/Footer', checks: ['toggleNoemaTheme', 'applyNoemaTheme', 'topTheme'] },
  { path: '/sw.js', title: 'Service Worker Keš (noema-v6)', checks: ['noema-v6'] },
];

function fetchUrl(path) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:3000${path}`, {
      headers: { 'Host': 'localhost:3000' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function runAudit() {
  console.log("=================================================");
  console.log("🔍 NOEMA COMPREHENSIVE E2E & HTML AUDIT SUITE");
  console.log("=================================================\n");

  let passed = 0;
  let failed = 0;

  console.log("--- 1. REVIZIJA PODSTRANICA & ELEMENTI U INTERFEJSU ---");
  for (const page of PAGES_TO_TEST) {
    try {
      const res = await fetchUrl(page.path);
      if (res.status !== 200) {
        console.error(`❌ [FAIL] ${page.title} (${page.path}) — Status: ${res.status}`);
        failed++;
        continue;
      }

      const missing = page.checks.filter(term => !res.body.includes(term));
      if (missing.length === 0) {
        console.log(`✅ [PASS] ${page.title} (${page.path}) — 200 OK | Potvrđeni svi ključni elementi (${page.checks.join(', ')})`);
        passed++;
      } else {
        console.error(`❌ [FAIL] ${page.title} (${page.path}) — Nedostaju elementi: ${missing.join(', ')}`);
        failed++;
      }
    } catch (err) {
      console.error(`❌ [ERROR] ${page.title} (${page.path}): ${err.message}`);
      failed++;
    }
  }

  console.log("\n--- 2. REVIZIJA API ENDPOINT-A & SERVISNOG KEŠA ---");
  for (const api of API_ENDPOINTS) {
    try {
      const res = await fetchUrl(api.path);
      if (res.status !== 200) {
        console.error(`❌ [FAIL] ${api.title} (${api.path}) — Status: ${res.status}`);
        failed++;
        continue;
      }

      let valid = true;
      if (api.jsonKey && (!res.body.includes(api.jsonKey))) {
        valid = false;
      }
      if (api.checks) {
        const missing = api.checks.filter(term => !res.body.includes(term));
        if (missing.length > 0) valid = false;
      }

      if (valid) {
        console.log(`✅ [PASS] ${api.title} (${api.path}) — Status 200 OK (${res.body.length} B) | Ispravan odziv`);
        passed++;
      } else {
        console.error(`❌ [FAIL] ${api.title} (${api.path}) — Neispravna struktura odziva`);
        failed++;
      }
    } catch (err) {
      console.error(`❌ [ERROR] ${api.title} (${api.path}): ${err.message}`);
      failed++;
    }
  }

  console.log("\n=================================================");
  console.log(`📊 REZULTAT DETALJNE REVIZIJE: ${passed} POLOŽENO / ${failed} PALO`);
  console.log("=================================================");
}

runAudit();
