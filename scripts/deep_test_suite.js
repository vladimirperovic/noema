import http from 'node:http';

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(`http://127.0.0.1:3000${path}`, {
      method,
      headers: {
        'Host': 'localhost:3000',
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, body: data, json });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runDeepAudit() {
  console.log("==========================================================");
  console.log("⚡ NOEMA DEEP INTEGRATION & CRUD MUTATION AUDIT SUITE");
  console.log("==========================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // 1. TODOS CRUD MUTATION TEST
    console.log("--- 1. MUTACIJSKI TEST ZADATAKA (TODOS CRUD) ---");
    const newTodoRes = await request('POST', '/api/todos', {
      title: 'Automatski Deep Test Zadatak',
      day: 'today',
      priority: 'high'
    });
    assert(newTodoRes.status === 201 && newTodoRes.json && newTodoRes.json.todo?.id, 'Stvaranje novog zadatka (POST /api/todos)');
    
    const createdTodoId = newTodoRes.json?.todo?.id;
    if (createdTodoId) {
      const updateTodoRes = await request('PATCH', `/api/todos/${createdTodoId}`, {
        title: 'Automatski Deep Test Zadatak — Izmijenjen',
        done: true
      });
      assert(updateTodoRes.status === 200 && updateTodoRes.json?.todo?.done === true, 'Izmjena naslova i statusa zadatka (PATCH /api/todos/:id)');

      const deleteTodoRes = await request('DELETE', `/api/todos/${createdTodoId}`);
      assert(deleteTodoRes.status === 200, 'Brisanje testnog zadatka (DELETE /api/todos/:id)');
    }

    // 2. NOTES CRUD MUTATION TEST
    console.log("\n--- 2. MUTACIJSKI TEST BILJEŠKI (NOTES CRUD) ---");
    const newNoteRes = await request('POST', '/api/notes', {
      title: 'Deep Test Bilješka',
      body: 'Sadržaj bilješke kreiran tokom dubokog testa.',
      labels: ['test', 'noema']
    });
    assert(newNoteRes.status === 201 && newNoteRes.json?.note?.id, 'Kreiranje bilješke (POST /api/notes)');
    
    const noteId = newNoteRes.json?.note?.id;
    if (noteId) {
      const updateNoteRes = await request('PATCH', `/api/notes/${noteId}`, {
        title: 'Ažurirana Deep Test Bilješka'
      });
      assert(updateNoteRes.status === 200 && updateNoteRes.json?.note?.title === 'Ažurirana Deep Test Bilješka', 'Ažuriranje bilješke (PATCH /api/notes/:id)');

      const delNoteRes = await request('DELETE', `/api/notes/${noteId}`);
      assert(delNoteRes.status === 200, 'Brisanje testne bilješke (DELETE /api/notes/:id)');
    }

    // 3. DOCUMENTS CRUD MUTATION TEST
    console.log("\n--- 3. MUTACIJSKI TEST DOKUMENATA (DOCUMENTS CRUD) ---");
    const newDocRes = await request('POST', '/api/documents', {
      title: 'Deep Test Dokument',
      body: '# Dokument Test\n\nOpis dokumenta.'
    });
    assert(newDocRes.status === 201 && newDocRes.json?.document?.id, 'Kreiranje dokumenta (POST /api/documents)');

    const docId = newDocRes.json?.document?.id;
    if (docId) {
      const delDocRes = await request('DELETE', `/api/documents/${docId}`);
      assert(delDocRes.status === 200, 'Brisanje testnog dokumenta (DELETE /api/documents/:id)');
    }

    // 4. AI PROJECTS / LINKS CRUD MUTATION TEST
    console.log("\n--- 4. MUTACIJSKI TEST AI PROJECTS (LINKS CRUD) ---");
    const newLinkRes = await request('POST', '/api/ai-projects', {
      url: `https://example.com/test-ai-project-${Date.now()}`,
      title: 'Deep Test AI Projekat',
      note: 'Automatski dodan link sa Ctrl+V imitacijom'
    });
    assert(newLinkRes.status === 201 && newLinkRes.json?.link?.id, 'Kreiranje AI projekta (POST /api/ai-projects)');

    const linkId = newLinkRes.json?.link?.id;
    if (linkId) {
      const updateLinkRes = await request('PATCH', `/api/ai-projects/${linkId}`, { pinned: true });
      assert(updateLinkRes.status === 200 && updateLinkRes.json?.link?.pinned === true, 'Pinovanje AI projekta (PATCH /api/ai-projects/:id)');

      const delLinkRes = await request('DELETE', `/api/ai-projects/${linkId}`);
      assert(delLinkRes.status === 200, 'Brisanje AI projekta (DELETE /api/ai-projects/:id)');
    }

    // 5. INSPIRATIONS & BUILDING SITES COLLECTION INTEGRITY TEST
    console.log("\n--- 5. INTEGRITET KOLEKCIJA GRADILIŠTA I INSPIRACIJE ---");
    const getInspRes = await request('GET', '/api/archive');
    assert(getInspRes.status === 200 && Array.isArray(getInspRes.json?.todos), 'Dohvatanje arhive svih zapisa (GET /api/archive)');

    // 6. FULL BACKUP EXPORT TEST (6 COLLECTIONS)
    console.log("\n--- 6. TEST PUNO IZVOZA BAZE (BACKUP DOWNLOAD) ---");
    const backupRes = await request('GET', '/api/backup/download');
    const backupData = backupRes.json?.data;
    assert(
      backupRes.status === 200 &&
      backupData &&
      Array.isArray(backupData.todos) &&
      Array.isArray(backupData.notes) &&
      Array.isArray(backupData.documents) &&
      Array.isArray(backupData.links) &&
      Array.isArray(backupData.buildingSites) &&
      Array.isArray(backupData.inspirations),
      'Preuzimanje kompletne arhive sa svih 6 kolekcija (GET /api/backup/download)'
    );

    // 7. SYSTEM STATS & OPENAPI CONTRACT TEST
    console.log("\n--- 7. TEST SUSTAVNIH STATISTIKA I OPENAPI DOKUMENTA ---");
    const sysRes = await request('GET', '/api/system');
    assert(sysRes.status === 200 && sysRes.json?.cpu, 'Odziv sistemskih resursa (GET /api/system)');

    const openApiRes = await request('GET', '/openapi.json');
    assert(openApiRes.status === 200 && openApiRes.json?.paths, 'Validnost OpenAPI 3.0 specifikacije (GET /openapi.json)');

  } catch (err) {
    console.error(`💥 Neočekivana greška u testu: ${err.message}`);
    failed++;
  }

  console.log("\n==========================================================");
  console.log(`📊 REZULTAT DUBOKOG TESTA: ${passed} POLOŽENO / ${failed} PALO`);
  console.log("==========================================================");
}

runDeepAudit();
