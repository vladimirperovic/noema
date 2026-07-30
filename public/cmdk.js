const cmdkHtml = `
<div id="cmdk-modal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:99999; align-items:center; justify-content:center; backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px);">
  <div style="background:var(--paper, #fcfaf8); width:90%; max-width:600px; border-radius:16px; padding:1.5rem; box-shadow:0 20px 40px rgba(0,0,0,0.2);">
    <input id="cmdk-input" type="text" placeholder="Unesi zadatak, link ili /n bilješku..." style="width:100%; font-size:1.5rem; border:none; border-bottom:2px solid var(--beacon, #b87333); background:transparent; color:var(--ink, #2d2a26); outline:none; padding:0.5rem 0; font-family:var(--font-display, Georgia, serif);">
    <div style="margin-top:1rem; font-family:var(--font-mono, monospace); font-size:0.75rem; color:var(--ink-4, #9a9488); display:flex; gap:1rem; flex-wrap: wrap;">
      <span><strong style="color:var(--beacon, #b87333)">http...</strong> → Link</span>
      <span><strong style="color:var(--beacon, #b87333)">/n ...</strong> → Nova Bilješka</span>
      <span><strong style="color:var(--beacon, #b87333)">Tekst</strong> → Zadatak za Danas</span>
    </div>
  </div>
</div>
`;

document.body.insertAdjacentHTML('beforeend', cmdkHtml);

// Mobile Safari can center fixed dialogs against the layout viewport instead of
// the currently visible area. Keep the task time picker centered in the dynamic
// viewport and inside the device safe area without changing its desktop layout.
if (document.querySelector('.tp-modal') && !document.getElementById('noema-mobile-time-picker-fix')) {
  const timePickerStyle = document.createElement('style');
  timePickerStyle.id = 'noema-mobile-time-picker-fix';
  timePickerStyle.textContent = `
    @media (max-width: 980px) {
      .tp-modal {
        top: 50dvh !important;
        width: min(280px, calc(100vw - 2rem)) !important;
        max-height: calc(100dvh - max(1rem, env(safe-area-inset-top)) - max(1rem, env(safe-area-inset-bottom))) !important;
        overflow-y: auto;
        overscroll-behavior: contain;
      }
    }
  `;
  document.head.appendChild(timePickerStyle);
}

// Jedan izvor istine za brzi desni meni na svim Noema stranicama.
const projectMenu = document.querySelector('.menu-nav');
if (projectMenu) {
  projectMenu.innerHTML = ``;
}

const linksMenuItem = document.querySelector('.menu-links-item');
if (linksMenuItem) {
  linksMenuItem.insertAdjacentHTML('afterend', `
    <a href="/ai-projects" class="menu-archive menu-links-item">
      <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Z"/><path d="m9 8 6 4-6 4Z"/></svg>
      AI Projects
    </a>
    <a href="/inspiration" class="menu-archive menu-links-item">
      <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m4 18 5-5 3 3 2-2 6 5"/></svg>
      Inspiration
    </a>`);
}

const modal = document.getElementById('cmdk-modal');
const input = document.getElementById('cmdk-input');

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    if (modal.style.display === 'none') {
      modal.style.display = 'flex';
      input.value = '';
      setTimeout(() => input.focus(), 50);
    } else {
      modal.style.display = 'none';
    }
  }
  if (e.key === 'Escape' && modal.style.display !== 'none') {
    modal.style.display = 'none';
  }
});

modal.addEventListener('click', (e) => {
  if (e.target.id === 'cmdk-modal') modal.style.display = 'none';
});

input.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') {
    const val = e.target.value.trim();
    if (!val) return;
    
    e.target.disabled = true;
    try {
      if (val.startsWith('http://') || val.startsWith('https://')) {
        await fetch('/api/links', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url: val }) });
      } else if (val.startsWith('/n ')) {
        await fetch('/api/notes', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title: val.substring(3).trim(), body: '' }) });
      } else {
        await fetch('/api/todos', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title: val, day: 'today', priority: 'normal' }) });
      }
      modal.style.display = 'none';
      
      if (typeof loadAll === 'function') loadAll();
      else if (typeof loadNotes === 'function') loadNotes();
      else if (typeof render === 'function') {
        // Zavisno gde smo, moramo ponovo preuzeti podatke da bismo pozvali render
        window.location.reload(); 
      }
      else window.location.reload();
      
    } catch (err) {
      alert('Greška: ' + err.message);
    } finally {
      e.target.disabled = false;
    }
  }
});