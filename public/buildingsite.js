(() => {
  const $ = (id) => document.getElementById(id);
  const publicGalleryMode = new URLSearchParams(window.location.search).has('gallery');
  document.documentElement.classList.toggle('public-gallery', publicGalleryMode);
  const els = {
    gallery: $('gallery'), collectionCount: $('collectionCount'), imageCount: $('imageCount'), pageStatus: $('pageStatus'),
    search: $('searchInput'), searchClear: $('searchClear'), gridRange: $('gridRange'), gridValue: $('gridValue'),
    tagFilters: $('tagFilters'), labelFilters: $('labelFilters'), labelOptions: $('labelOptions'), collectionLabel: $('labelInput'),
    locationInput: $('locationInput'), addressInput: $('addressInput'), lookupAddress: $('lookupAddress'), tagsInput: $('tagsInput'), editLocationInput: $('editLocationInput'), editAddressInput: $('editAddressInput'), editLookupAddress: $('editLookupAddress'), editTagsInput: $('editTagsInput'),
    addOverlay: $('addOverlay'), editOverlay: $('editOverlay'), viewerOverlay: $('viewerOverlay'), hotspotOverlay: $('hotspotOverlay'),
    viewer: document.querySelector('.viewer'), fullscreen: $('fullscreenButton'), addForm: $('addForm'),
    title: $('titleInput'), link: $('linkInput'), fileInput: $('fileInput'), dropzone: $('dropzone'),
    selected: $('selectedFiles'), fileMeta: $('fileMeta'), error: $('formError'), save: $('saveButton'),
    editForm: $('editForm'), editTitle: $('editTitleInput'), editLink: $('editLinkInput'), editLabel: $('editLabelInput'),
    editError: $('editError'), viewerTitle: $('viewerTitle'), viewerStatus: $('viewerStatus'), viewerImage: $('viewerImage'),
    viewerDate: $('viewerDate'), thumbRail: $('thumbRail'), addLabelChips: $('addLabelChips'), editLabelChips: $('editLabelChips'),
    mapWrapper: $('mapWrapper'), mapStatus: $('mapStatus'), timelineWrapper: $('timelineWrapper'), timelineYears: $('timelineYears'),
    timelineFeed: $('timelineFeed'), timelineSort: $('timelineSort'), timelineSummary: $('timelineSummary'), timelineRange: $('timelineRange'), timelineCursor: $('timelineCursor'),
    hotspotForm: $('hotspotForm'), hotspotName: $('hotspotName'), hotspotLink: $('hotspotLink'), hotspotError: $('hotspotError'),
    libraryView: $('libraryView'), libraryTools: document.querySelector('.library-tools'), viewSwitcher: $('viewSwitcher'), photoStage: $('photoStageWrapper'),
    albumView: $('albumView'), albumBack: $('albumBack'), albumTitle: $('albumTitle'), albumMeta: $('albumMeta'), albumTags: $('albumTags'),
    albumGrid: $('albumGrid'), albumGridRange: $('albumGridRange'), albumGridValue: $('albumGridValue'), albumShare: $('albumShare'), shareGallery: $('shareGallery'),
  };

  let collections = [];
  let pendingFiles = [];
  let previewUrls = [];
  let editingId = null;
  let viewerItem = null;
  let viewerIndex = 0;
  let activeLabel = '';
  let activeTag = '';
  let galleryColumns = 2;
  let albumColumns = 4;
  let currentAlbumId = '';
  let viewerPseudoFullscreen = false;
  let currentViewMode = 'grid';
  let timelineOrder = 'desc';
  let timelinePhotos = [];
  let isAddingHotspot = false;
  let pendingHotspotPosition = null;
  let map = null;
  let mapMarkers = [];
  let mapRenderSequence = 0;
  const fileMetadata = new WeakMap();
  const returnFocus = new WeakMap();

  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  const escape = (value) => String(value || '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  const imageLabel = (count) => count === 1 ? 'slika' : count >= 2 && count <= 4 ? 'slike' : 'slika';
  const formatBytes = (bytes) => {
    const value = Number(bytes) || 0;
    if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(value >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
    if (value >= 1024) return `${Math.round(value / 1024)} KB`;
    return `${value} B`;
  };
  const api = async (path, options = {}) => {
    const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || 'Zahtjev nije uspio.');
    return data;
  };
  async function shareGallery() {
    const originalLabel = els.shareGallery.textContent;
    els.shareGallery.disabled = true;
    els.shareGallery.textContent = 'Pripremam link…';
    try {
      const result = await api('/api/gallery-share', { method: 'POST' });
      if (navigator.share) {
        await navigator.share({ title: 'Example Studio galerije', text: 'Building Site i Inspiration galerije', url: result.url });
        els.shareGallery.textContent = 'Podijeljeno';
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(result.url);
        els.shareGallery.textContent = 'Link je kopiran';
      } else {
        window.prompt('Kopiraj javni link galerije:', result.url);
        els.shareGallery.textContent = 'Link je spreman';
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        els.pageStatus.textContent = error.message;
        els.shareGallery.textContent = 'Pokušaj ponovo';
      }
    } finally {
      els.shareGallery.disabled = false;
      window.setTimeout(() => { els.shareGallery.textContent = originalLabel; }, 2400);
    }
  }
  const parseTags = (value) => {
    const tags = String(value || '').split(/[\s,]+/).map((tag) => tag.replace(/^#+/, '').trim()).filter(Boolean);
    return [...new Map(tags.map((tag) => [tag.toLocaleLowerCase('sr'), tag])).values()].slice(0, 30);
  };
  const formatTags = (tags) => (tags || []).map((tag) => `#${tag}`).join(' ');
  const safeHttpUrl = (value) => {
    try {
      const parsed = new URL(String(value || ''));
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
    } catch {
      return '';
    }
  };
  const albumUrl = (id) => {
    const url = new URL(`${window.location.pathname}${window.location.search}`, window.location.origin);
    url.hash = `album=${encodeURIComponent(id)}`;
    return url.href;
  };
  const whatsappShareUrl = (item) => {
    const message = `${item.title} — pogledaj album projekta: ${albumUrl(item.id)}`;
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  };
  const dateInputValue = (value) => {
    const timestamp = Date.parse(value || '');
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : '';
  };
  const imageTimestamp = (item, image) => {
    const takenAt = Date.parse(image.takenAt || '');
    return Number.isFinite(takenAt) ? takenAt : Number(item.createdAt) || 0;
  };
  const displayImages = (item) => {
    const images = Array.isArray(item?.images) ? item.images : [];
    const featured = images.find((image) => image.id === item?.featuredImageId);
    return featured ? [featured, ...images.filter((image) => image.id !== featured.id)] : images;
  };
  const featuredImageIndex = (item) => {
    const index = (item?.images || []).findIndex((image) => image.id === item?.featuredImageId);
    return index >= 0 ? index : 0;
  };
  const replaceCollection = (buildingSite) => {
    collections = collections.map((item) => item.id === buildingSite.id ? buildingSite : item);
    if (viewerItem?.id === buildingSite.id) viewerItem = buildingSite;
  };

  const GEOCODE_CACHE = new Map();
  const CITY_COORDINATES = {
    beograd: [44.8176, 20.4569], senjak: [44.7931, 20.4431], dedinje: [44.7797, 20.4533],
    'vračar': [44.7972, 20.4722], vracar: [44.7972, 20.4722], 'dorćol': [44.8236, 20.4614],
    dorcol: [44.8236, 20.4614], zemun: [44.8431, 20.4042], 'novi sad': [45.2671, 19.8335],
    'niš': [43.3209, 21.8958], nis: [43.3209, 21.8958], podgorica: [42.4304, 19.2594],
    budva: [42.2864, 18.84], kotor: [42.4247, 18.7712], tivat: [42.4364, 18.6961],
    'herceg novi': [42.4572, 18.5314], bar: [42.0937, 19.1003], ulcinj: [41.9311, 19.2147],
    sarajevo: [43.8563, 18.4131], 'banja luka': [44.7722, 17.191], mostar: [43.3438, 17.8078],
    zagreb: [45.815, 15.9819], split: [43.5081, 16.4402], dubrovnik: [42.6507, 18.0944],
  };

  function parseCoordinates(text) {
    if (!text) return null;
    const match = String(text).match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (match) {
      const coords = [Number(match[1]), Number(match[2])];
      if (Math.abs(coords[0]) <= 90 && Math.abs(coords[1]) <= 180) return coords;
    }
    const lower = String(text).toLocaleLowerCase('sr');
    for (const [key, coords] of Object.entries(CITY_COORDINATES)) {
      if (lower.includes(key)) return coords;
    }
    return null;
  }

  async function fillAddressFromCoordinates(locationInput, addressInput, button, errorOutput) {
    const coords = parseCoordinates(locationInput.value);
    if (!coords) {
      errorOutput.textContent = 'Unesi GPS koordinate u obliku 44.80061, 20.48249.';
      return;
    }
    button.disabled = true;
    errorOutput.textContent = '';
    try {
      const result = await api(`/api/geocode/reverse?lat=${encodeURIComponent(coords[0])}&lon=${encodeURIComponent(coords[1])}`);
      if (!result.address) throw new Error('Za ove koordinate nije pronađena adresa.');
      addressInput.value = result.address;
    } catch (error) {
      errorOutput.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }

  async function getCoordinatesForLocation(text) {
    if (!text) return null;
    const direct = parseCoordinates(text);
    if (direct) return direct;
    const key = String(text).trim().toLocaleLowerCase('sr');
    if (GEOCODE_CACHE.has(key)) return GEOCODE_CACHE.get(key);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(text)}`);
      if (!response.ok) return null;
      const data = await response.json();
      const coords = data?.[0] ? [Number(data[0].lat), Number(data[0].lon)] : null;
      GEOCODE_CACHE.set(key, coords);
      return coords;
    } catch {
      GEOCODE_CACHE.set(key, null);
      return null;
    }
  }

  function exifDateToIso(value) {
    const match = String(value || '').match(/^(\d{4}):(\d{2}):(\d{2})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
    if (!match) return '';
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] || 0), Number(match[5] || 0), Number(match[6] || 0));
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  }

  function extractImageMetadata(file) {
    return new Promise((resolve) => {
      if (!window.EXIF) return resolve({ takenAt: '' });
      try {
        window.EXIF.getData(file, function readExif() {
          const lat = window.EXIF.getTag(this, 'GPSLatitude');
          const lng = window.EXIF.getTag(this, 'GPSLongitude');
          const latRef = window.EXIF.getTag(this, 'GPSLatitudeRef');
          const lngRef = window.EXIF.getTag(this, 'GPSLongitudeRef');
          if (Array.isArray(lat) && Array.isArray(lng)) {
            const latitude = Number(lat[0]) + Number(lat[1]) / 60 + Number(lat[2]) / 3600;
            const longitude = Number(lng[0]) + Number(lng[1]) / 60 + Number(lng[2]) / 3600;
            const coords = `${(latRef === 'S' ? -latitude : latitude).toFixed(5)}, ${(lngRef === 'W' ? -longitude : longitude).toFixed(5)}`;
            if (!els.locationInput.value.trim()) {
              els.locationInput.value = coords;
              els.fileMeta.textContent = `GPS koordinati su očitani iz fotografije: ${coords}`;
            }
          }
          const takenAt = exifDateToIso(window.EXIF.getTag(this, 'DateTimeOriginal') || window.EXIF.getTag(this, 'DateTimeDigitized') || window.EXIF.getTag(this, 'DateTime'));
          resolve({ takenAt });
        });
      } catch {
        resolve({ takenAt: '' });
      }
    });
  }

  function initMap() {
    if (map) return true;
    if (!window.L) {
      els.mapStatus.hidden = false;
      return false;
    }
    try {
      const theme = document.documentElement.dataset.theme === 'dark' ? 'dark_all' : 'light_all';
      map = window.L.map('siteMap', { zoomControl: true }).setView([43.85, 19.5], 7);
      window.L.tileLayer(`https://{s}.basemaps.cartocdn.com/${theme}/{z}/{x}/{y}{r}.png`, {
        attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd', maxZoom: 19,
      }).addTo(map);
      els.mapStatus.hidden = true;
      return true;
    } catch {
      els.mapStatus.hidden = false;
      return false;
    }
  }

  async function renderMapMarkers(items) {
    if (!initMap()) return;
    const sequence = ++mapRenderSequence;
    mapMarkers.forEach((marker) => map.removeLayer(marker));
    mapMarkers = [];
    const bounds = [];
    for (const item of items) {
      const locationText = item.location || item.sourceUrl || item.address || item.label || item.title;
      const coords = await getCoordinatesForLocation(locationText) || await getCoordinatesForLocation(item.title);
      if (sequence !== mapRenderSequence) return;
      if (!coords) continue;
      const thumb = item.images?.[0]?.thumbnail || '';
      const iconHtml = thumb
        ? `<div class="custom-pin-marker" style="background-image:url('${escape(thumb)}')"></div>`
        : '<div class="custom-pin-marker" style="background:#e8b07d"></div>';
      const marker = window.L.marker(coords, {
        icon: window.L.divIcon({ className: 'map-custom-div-icon', html: iconHtml, iconSize: [36, 36], iconAnchor: [18, 36], popupAnchor: [0, -36] }),
      }).addTo(map);
      const popupLocation = item.address || locationText;
      const popup = `<div class="map-popup-card"><h4 class="map-popup-title">${escape(item.title)}</h4><div class="map-popup-meta">${escape(popupLocation)} · ${item.images?.length || 0} ${imageLabel(item.images?.length || 0)}</div>${thumb ? `<img src="${escape(thumb)}" class="map-popup-img" alt="">` : ''}<button class="map-popup-btn" type="button" onclick="window.noemaOpenAlbum('${escape(item.id)}')">View radove</button></div>`;
      marker.bindPopup(popup);
      mapMarkers.push(marker);
      bounds.push(coords);
    }
    if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  }

  function getVisibleCollections() {
    const query = els.search.value.trim().toLocaleLowerCase('sr');
    return collections.filter((item) => {
      if (activeLabel && item.label !== activeLabel) return false;
      if (activeTag && !(item.tags || []).includes(activeTag)) return false;
      if (!query) return true;
      return [item.title, item.label, item.address, item.location, item.sourceUrl, item.documentUrl, ...(item.tags || [])].join(' ').toLocaleLowerCase('sr').includes(query);
    });
  }

  function timelineCursorLabel(timestamp) {
    if (!timestamp) return 'Bez datuma';
    return new Intl.DateTimeFormat('sr-Latn', { month: 'short', year: 'numeric' }).format(timestamp);
  }

  function syncTimelineNavigator(position) {
    const safePosition = Math.max(0, Math.min(timelinePhotos.length - 1, Number(position) || 0));
    const photo = timelinePhotos[safePosition];
    if (!photo) return;
    const year = photo.timestamp ? String(new Date(photo.timestamp).getFullYear()) : 'Bez datuma';
    const maxScroll = els.timelineFeed.scrollHeight - els.timelineFeed.clientHeight;
    const pct = maxScroll > 0 ? Math.min(100, Math.max(0, Math.round((els.timelineFeed.scrollTop / maxScroll) * 100))) : 0;
    els.timelineRange.value = String(pct);
    els.timelineRange.setAttribute('aria-valuetext', timelineCursorLabel(photo.timestamp));
    els.timelineCursor.textContent = timelineCursorLabel(photo.timestamp);
    els.timelineYears.querySelectorAll('.timeline-year').forEach((button) => button.classList.toggle('active', button.dataset.timelineYear === year));
  }

  function scrollTimelineToPercentage(pct, behavior = 'auto') {
    const safePct = Math.max(0, Math.min(100, Number(pct) || 0)) / 100;
    const maxScroll = els.timelineFeed.scrollHeight - els.timelineFeed.clientHeight;
    els.timelineFeed.scrollTo({ top: Math.max(0, Math.round(safePct * maxScroll)), behavior });
  }

  function scrollTimelineToYear(year) {
    const section = els.timelineFeed.querySelector(`[data-year-section="${year}"]`);
    if (!section) return;
    let targetTop = 0;
    let node = section;
    while (node && node !== els.timelineFeed) {
      targetTop += node.offsetTop;
      node = node.offsetParent;
    }
    els.timelineFeed.scrollTo({ top: Math.max(0, targetTop - 8), behavior: 'smooth' });
  }

  function renderTimeline(items) {
    const photos = items.flatMap((item) => (item.images || []).map((image, index) => ({ item, image, index, timestamp: imageTimestamp(item, image) })));
    photos.sort((a, b) => timelineOrder === 'asc' ? a.timestamp - b.timestamp : b.timestamp - a.timestamp);
    timelinePhotos = photos;
    const groups = new Map();
    photos.forEach((photo, position) => {
      photo.position = position;
      const year = photo.timestamp ? new Date(photo.timestamp).getFullYear() : 'Bez datuma';
      if (!groups.has(year)) groups.set(year, []);
      groups.get(year).push(photo);
    });
    const years = [...groups.keys()];
    if (!photos.length) {
      els.timelineSummary.textContent = 'Nema fotografija za izabrane filtere';
      els.timelineYears.innerHTML = '';
      els.timelineFeed.innerHTML = '<div class="empty"><div><strong>Nema fotografija.</strong>Promijeni pretragu ili filter.</div></div>';
      els.timelineRange.disabled = true;
      els.timelineCursor.textContent = '—';
      return;
    }
    const numericYears = photos.map((photo) => photo.timestamp ? new Date(photo.timestamp).getFullYear() : null).filter(Number.isFinite);
    const firstYear = numericYears.length ? Math.min(...numericYears) : null;
    const lastYear = numericYears.length ? Math.max(...numericYears) : null;
    els.timelineSummary.textContent = `${photos.length} fotografija${firstYear ? ` · ${firstYear}${firstYear === lastYear ? '' : `—${lastYear}`}` : ''}`;
    els.timelineYears.innerHTML = years.map((year, index) => `<button class="timeline-year ${index === 0 ? 'active' : ''}" type="button" data-timeline-year="${escape(year)}">${escape(year)}</button>`).join('');
    els.timelineRange.disabled = false;
    els.timelineRange.min = '0';
    els.timelineRange.max = '100';
    els.timelineRange.value = '0';
    els.timelineFeed.innerHTML = years.map((year) => {
      const group = groups.get(year);
      const cards = group.map(({ item, image, index, timestamp, position }) => {
        const label = timestamp ? new Intl.DateTimeFormat('sr-Latn', { day: '2-digit', month: 'short', year: 'numeric' }).format(timestamp) : 'Datum nije upisan';
        return `<button class="timeline-card" type="button" data-timeline-site="${escape(item.id)}" data-timeline-index="${index}" data-timeline-position="${position}"><img src="${escape(image.thumbnail)}" alt="" loading="lazy"><span class="timeline-card-copy"><span class="timeline-card-title">${escape(item.title)}</span><span class="timeline-card-date">${escape(label)}</span></span></button>`;
      }).join('');
      return `<section class="timeline-section" id="timeline-year-${escape(year)}" data-year-section="${escape(year)}"><h3 class="timeline-year-title">${escape(year)} <span>${group.length} ${imageLabel(group.length)}</span></h3><div class="timeline-grid">${cards}</div></section>`;
    }).join('');
    syncTimelineNavigator(0);
  }

  function setGalleryColumns(value, persist = true) {
    galleryColumns = Math.min(5, Math.max(2, Number(value) || 2));
    els.gallery.style.setProperty('--gallery-columns', galleryColumns);
    els.gallery.dataset.columns = galleryColumns;
    els.gridRange.value = galleryColumns;
    els.gridValue.textContent = `${galleryColumns} kol.`;
    els.gridRange.setAttribute('aria-valuetext', `${galleryColumns} projekata u redu`);
    if (persist) try { localStorage.setItem('noema-buildingsite-columns', galleryColumns); } catch {}
  }

  function setAlbumColumns(value, persist = true) {
    albumColumns = Math.min(6, Math.max(2, Number(value) || 4));
    els.albumGrid.style.setProperty('--album-columns', albumColumns);
    els.albumGrid.dataset.columns = albumColumns;
    els.albumGridRange.value = albumColumns;
    els.albumGridValue.textContent = `${albumColumns} kol.`;
    els.albumGridRange.setAttribute('aria-valuetext', `${albumColumns} slika u redu`);
    if (persist) try { localStorage.setItem('noema-buildingsite-album-columns', albumColumns); } catch {}
  }

  function renderAlbum(item) {
    const images = Array.isArray(item.images) ? item.images : [];
    const location = item.location || item.sourceUrl || '';
    const totalBytes = item.totalBytes ?? images.reduce((total, image) => total + (Number(image.size) || 0), 0);
    els.albumTitle.textContent = item.title;
    els.albumMeta.innerHTML = `<span>${images.length} ${imageLabel(images.length)}</span>${item.address ? `<span>${escape(item.address)}</span>` : ''}${location ? `<span>${escape(location)}</span>` : ''}<span>${formatBytes(totalBytes)}</span>${item.label ? `<span class="collection-label">${escape(item.label)}</span>` : ''}`;
    els.albumTags.innerHTML = (item.tags || []).map((tag) => `<span class="album-tag">#${escape(tag)}</span>`).join('');
    els.albumShare.href = whatsappShareUrl(item);
    els.albumShare.setAttribute('aria-label', `Podijeli album ${item.title} na WhatsApp`);
    els.albumGrid.innerHTML = images.length
      ? images.map((image, index) => {
        const featured = image.id === item.featuredImageId;
        return `<div class="album-photo"><button class="album-photo-open" type="button" data-album-image="${index}" aria-label="Otvori ${escape(item.title)}, slika ${index + 1}"><img src="${escape(image.thumbnail)}" alt="${escape(item.title)}, slika ${index + 1}" loading="lazy"><span class="album-photo-index">${String(index + 1).padStart(2, '0')}</span></button><button class="album-feature ${featured ? 'is-featured' : ''}" type="button" data-feature-image="${escape(image.id)}" aria-label="${featured ? 'Naslovna fotografija albuma' : 'Postavi kao naslovnu fotografiju'}" aria-pressed="${featured}">${featured ? '★' : '☆'}</button></div>`;
      }).join('')
      : '<div class="empty"><div><strong>Album nema fotografija.</strong></div></div>';
  }

  function openAlbum(item, updateHistory = true) {
    if (!item) return;
    currentAlbumId = item.id;
    els.libraryView.hidden = true;
    els.albumView.hidden = false;
    renderAlbum(item);
    document.title = `${item.title} — Noema Building Site`;
    if (updateHistory) {
      const hash = `#album=${encodeURIComponent(item.id)}`;
      if (window.location.hash !== hash) window.history.pushState({ albumId: item.id }, '', hash);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeAlbum(updateHistory = true) {
    currentAlbumId = '';
    els.albumView.hidden = true;
    els.libraryView.hidden = false;
    document.title = 'Noema — Building Site & Building Site Map';
    if (updateHistory && window.location.hash) window.history.pushState({}, '', `${window.location.pathname}${window.location.search}`);
    setViewMode(currentViewMode, false);
  }

  function syncAlbumFromLocation() {
    const match = window.location.hash.match(/^#album=(.+)$/);
    if (!match) return closeAlbum(false);
    let id = '';
    try { id = decodeURIComponent(match[1]); } catch { return closeAlbum(false); }
    const item = collections.find((entry) => entry.id === id);
    if (item) openAlbum(item, false);
    else closeAlbum(false);
  }

  function setViewMode(mode, persist = true) {
    currentViewMode = ['grid', 'map', 'both', 'timeline'].includes(mode) ? mode : 'grid';
    els.viewSwitcher.querySelectorAll('[data-view]').forEach((button) => {
      const active = button.dataset.view === currentViewMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const showMap = currentViewMode === 'map' || currentViewMode === 'both';
    const showGallery = currentViewMode === 'grid' || currentViewMode === 'both';
    els.mapWrapper.classList.toggle('visible', showMap);
    els.timelineWrapper.hidden = currentViewMode !== 'timeline';
    els.gallery.style.display = showGallery ? 'grid' : 'none';
    els.libraryTools.style.display = currentViewMode === 'map' ? 'none' : 'grid';
    if (currentViewMode === 'timeline') els.timelineWrapper.before(els.libraryTools);
    else els.gallery.before(els.libraryTools);
    if (persist) try { localStorage.setItem('noema-buildingsite-view', currentViewMode); } catch {}
    if (showMap) setTimeout(() => {
      if (!initMap()) return;
      map.invalidateSize();
      renderMapMarkers(getVisibleCollections());
    }, 50);
    if (currentViewMode === 'timeline') renderTimeline(getVisibleCollections());
  }

  function updateFormLabelChips(container, input) {
    if (!container || !input) return;
    const labels = [...new Set(collections.map((item) => item.label).filter(Boolean))].sort();
    const current = input.value.trim();
    container.innerHTML = labels.map((label) => `<button class="label-chip ${current === label ? 'active' : ''}" type="button" data-fill="${escape(label)}">${escape(label)}</button>`).join('');
  }

  function bindFormLabelChips(container, input) {
    if (!container || !input || container.dataset.bound) return;
    container.addEventListener('click', (event) => {
      const button = event.target.closest('[data-fill]');
      if (!button) return;
      input.value = input.value.trim() === button.dataset.fill ? '' : button.dataset.fill;
      updateFormLabelChips(container, input);
    });
    input.addEventListener('input', () => updateFormLabelChips(container, input));
    container.dataset.bound = 'true';
  }

  function render() {
    els.collectionCount.textContent = collections.length;
    els.imageCount.textContent = collections.reduce((sum, item) => sum + (item.images?.length || 0), 0);
    const labels = [...new Set(collections.map((item) => item.label).filter(Boolean))].sort();
    if (activeLabel && !labels.includes(activeLabel)) activeLabel = '';
    els.labelOptions.innerHTML = labels.map((label) => `<option value="${escape(label)}"></option>`).join('');
    els.labelFilters.innerHTML = [`<button class="filter-chip ${activeLabel ? '' : 'active'}" type="button" data-label="">Sve</button>`, ...labels.map((label) => `<button class="filter-chip ${activeLabel === label ? 'active' : ''}" type="button" data-label="${escape(label)}">${escape(label)}</button>`)].join('');
    const tags = [...new Set(collections.flatMap((item) => item.tags || []))].sort();
    if (activeTag && !tags.includes(activeTag)) activeTag = '';
    els.tagFilters.innerHTML = [`<button class="tag-chip ${activeTag ? '' : 'active'}" type="button" data-tag="">#Sve</button>`, ...tags.map((tag) => `<button class="tag-chip ${activeTag === tag ? 'active' : ''}" type="button" data-tag="${escape(tag)}">#${escape(tag)}</button>`)].join('');
    updateFormLabelChips(els.addLabelChips, els.collectionLabel);
    updateFormLabelChips(els.editLabelChips, els.editLabel);
    els.searchClear.hidden = !els.search.value.trim();
    const visible = getVisibleCollections();
    if (els.mapWrapper.classList.contains('visible')) renderMapMarkers(visible);
    if (!els.timelineWrapper.hidden) renderTimeline(visible);
    if (currentAlbumId) {
      const currentAlbum = collections.find((item) => item.id === currentAlbumId);
      if (currentAlbum) renderAlbum(currentAlbum);
    }
    if (!visible.length) {
      const filtered = els.search.value.trim() || activeLabel || activeTag;
      els.gallery.innerHTML = `<div class="empty"><div><strong>${filtered ? 'No results.' : 'No building sites yet.'}</strong>${filtered ? 'Change search, label or hashtag.' : 'Use the Add button to save the first photos of works.'}</div></div>`;
      return;
    }
    els.gallery.innerHTML = visible.map((item) => {
      const itemImages = Array.isArray(item.images) ? item.images : [];
      if (!itemImages.length) return `<article class="collection"><div class="empty"><div><strong>${escape(item.title)}</strong>Projekat nema fotografija.</div></div></article>`;
      const images = displayImages(item).slice(0, 3);
      const stack = [];
      if (images[1]) stack.push(`<span class="photo photo-left"><img src="${escape(images[1].thumbnail)}" alt="" loading="lazy"></span>`);
      if (images[2]) stack.push(`<span class="photo photo-right"><img src="${escape(images[2].thumbnail)}" alt="" loading="lazy"></span>`);
      stack.push(`<span class="photo photo-front"><img src="${escape(images[0].thumbnail)}" alt="${escape(item.title)}" loading="lazy"></span>`);
      const location = item.location || item.sourceUrl;
      const addressHtml = item.address ? `<span class="source">${escape(item.address)}</span>` : '';
      const locationHtml = location ? `<span class="source">${escape(location)}</span>` : '';
      const documentUrl = safeHttpUrl(item.documentUrl);
      const documentHtml = documentUrl ? `<a class="source" href="${escape(documentUrl)}" target="_blank" rel="noopener noreferrer">Dokumentacija</a>` : '';
      const label = item.label ? `<span class="collection-label">${escape(item.label)}</span>` : '';
      const labelRow = label ? `<div class="meta collection-label-row">${label}</div>` : '';
      const addressRow = (addressHtml || locationHtml || documentHtml) ? `<div class="meta collection-address-row">${addressHtml}${locationHtml}${documentHtml}</div>` : '';
      const tagsHtml = (item.tags || []).map((tag) => `<button class="meta-tag" type="button" data-tag="${escape(tag)}">#${escape(tag)}</button>`).join(' ');
      const totalBytes = item.totalBytes ?? itemImages.reduce((total, image) => total + (Number(image.size) || 0), 0);
      return `<article class="collection"><button class="photo-stack" type="button" data-view="${escape(item.id)}" aria-label="Otvori ${escape(item.title)} u lightboxu">${stack.join('')}</button><div class="collection-info"><div class="collection-copy"><h2><a class="collection-title-link" href="#album=${encodeURIComponent(item.id)}" data-album="${escape(item.id)}">${escape(item.title)}</a></h2><div class="meta collection-meta"><span>${itemImages.length} ${imageLabel(itemImages.length)}</span><span class="collection-size">${formatBytes(totalBytes)}</span></div>${labelRow}${addressRow}${tagsHtml ? `<div class="meta collection-tags" aria-label="Hashtagovi projekta">${tagsHtml}</div>` : ''}</div><div class="collection-actions"><a class="quiet-button" href="${escape(whatsappShareUrl(item))}" target="_blank" rel="noopener noreferrer" aria-label="Podijeli album ${escape(item.title)} na WhatsApp">Podijeli</a><button class="quiet-button" type="button" data-edit="${escape(item.id)}">Izmijeni</button><button class="quiet-button danger" type="button" data-delete="${escape(item.id)}">Delete</button></div></div></article>`;
    }).join('');
  }

  async function load() {
    try {
      collections = (await api('/api/buildingsites')).buildingSites || [];
      els.pageStatus.textContent = '';
      render();
      syncAlbumFromLocation();
    } catch (error) {
      els.pageStatus.textContent = error.message;
      els.gallery.innerHTML = `<div class="empty"><div><strong>Building sites not loaded.</strong>${escape(error.message)}</div></div>`;
    }
  }

  function viewerIsFullscreen() { return viewerPseudoFullscreen || document.fullscreenElement === els.viewerOverlay; }
  function syncViewerFullscreen() {
    const active = viewerIsFullscreen();
    els.viewerOverlay.classList.toggle('viewer-fullscreen', active);
    els.viewer.classList.remove('viewer-controls-visible');
    els.fullscreen.textContent = active ? '⤢' : '⛶';
    els.fullscreen.setAttribute('aria-label', active ? 'Izađi iz fullscreen prikaza' : 'View preko cijelog ekrana');
    els.fullscreen.setAttribute('aria-pressed', String(active));
  }
  function hideViewerControls() { els.viewer.classList.remove('viewer-controls-visible'); }
  function revealViewerControls() { if (viewerIsFullscreen()) els.viewer.classList.add('viewer-controls-visible'); }
  function leaveViewerFullscreen() {
    viewerPseudoFullscreen = false;
    hideViewerControls();
    if (document.fullscreenElement === els.viewerOverlay) document.exitFullscreen().catch(() => {});
    syncViewerFullscreen();
  }
  async function toggleViewerFullscreen() {
    if (viewerIsFullscreen()) return leaveViewerFullscreen();
    if (els.viewerOverlay.requestFullscreen) {
      try { await els.viewerOverlay.requestFullscreen(); return; } catch {}
    }
    viewerPseudoFullscreen = true;
    syncViewerFullscreen();
  }
  function visibleOverlays() { return [els.addOverlay, els.editOverlay, els.viewerOverlay, els.hotspotOverlay].filter((overlay) => !overlay.hidden); }
  function openOverlay(element) {
    returnFocus.set(element, document.activeElement);
    element.hidden = false;
    document.body.style.overflow = 'hidden';
    if (element === els.viewerOverlay) document.body.classList.add('viewer-open');
    requestAnimationFrame(() => {
      const preferred = element.querySelector('[autofocus],form input,form select,form textarea');
      const fallback = element.querySelector('button,[tabindex]:not([tabindex="-1"])');
      (preferred || fallback)?.focus();
    });
  }
  function closeOverlay(element) {
    if (!element || element.hidden) return;
    if (element === els.viewerOverlay) {
      leaveViewerFullscreen();
      document.body.classList.remove('viewer-open');
    }
    if (element === els.hotspotOverlay) {
      pendingHotspotPosition = null;
      isAddingHotspot = false;
      resetAddHotspotButton();
    }
    element.hidden = true;
    if (!visibleOverlays().length) document.body.style.overflow = '';
    const target = returnFocus.get(element);
    if (target?.isConnected) target.focus();
  }
  function trapFocus(event, overlay) {
    if (event.key !== 'Tab') return;
    const focusable = [...overlay.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')].filter((item) => item.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function resetFiles() {
    previewUrls.forEach(URL.revokeObjectURL);
    previewUrls = [];
    pendingFiles = [];
    els.fileInput.value = '';
    renderSelected();
  }
  function renderSelected() {
    previewUrls.forEach(URL.revokeObjectURL);
    previewUrls = pendingFiles.map((file) => URL.createObjectURL(file));
    els.selected.innerHTML = pendingFiles.map((file, index) => `<div class="selected-item"><img src="${previewUrls[index]}" alt=""><button class="remove-file" type="button" data-remove-file="${index}" aria-label="Ukloni sliku">×</button></div>`).join('');
    els.fileMeta.textContent = pendingFiles.length ? `Izabrano: ${pendingFiles.length}. Datum i GPS se čitaju iz EXIF podataka.` : 'Nijedna slika nije izabrana.';
  }
  function addFiles(fileList) {
    els.error.textContent = '';
    for (const file of fileList) {
      if (!allowedTypes.has(file.type)) { els.error.textContent = `${file.name}: format nije podržan.`; continue; }
      if (file.size > 10 * 1024 * 1024) { els.error.textContent = `${file.name}: slika je veća od 10 MB.`; continue; }
      if (pendingFiles.length >= 35) { els.error.textContent = 'Možeš dodati najviše 35 slika.'; break; }
      const totalSize = pendingFiles.reduce((sum, item) => sum + item.size, 0) + file.size;
      if (totalSize > 60 * 1024 * 1024) { els.error.textContent = 'Ukupna veličina kolekcije može biti najviše 60 MB.'; break; }
      pendingFiles.push(file);
      fileMetadata.set(file, extractImageMetadata(file));
    }
    renderSelected();
  }
  const fileBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  async function thumbnailBase64(file) {
    const bitmap = await createImageBitmap(file);
    const width = 640;
    const height = 480;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    const scale = Math.max(width / bitmap.width, height / bitmap.height);
    context.drawImage(bitmap, (width - bitmap.width * scale) / 2, (height - bitmap.height * scale) / 2, bitmap.width * scale, bitmap.height * scale);
    bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob) throw new Error('Thumbnail nije napravljen.');
    return fileBase64(blob);
  }

  function resetAddHotspotButton() {
    const button = $('addHotspotBtn');
    button.style.borderColor = '';
    button.style.color = '#eee9e0';
    button.textContent = 'Dodaj oznaku';
    els.photoStage.classList.remove('adding-hotspot');
  }
  function openViewer(item, index) {
    if (!item.images?.length) return;
    viewerItem = item;
    viewerIndex = Math.max(0, Math.min(index, item.images.length - 1));
    els.viewerTitle.textContent = item.title;
    els.viewerStatus.textContent = '';
    isAddingHotspot = false;
    resetAddHotspotButton();
    updateViewer();
    openOverlay(els.viewerOverlay);
    syncViewerFullscreen();
  }
  window.noemaOpenViewer = (id) => {
    const item = collections.find((entry) => entry.id === id);
    if (item) openViewer(item, 0);
  };
  window.noemaOpenAlbum = (id) => {
    const item = collections.find((entry) => entry.id === id);
    if (item) openAlbum(item);
  };

  function updateViewer() {
    const image = viewerItem?.images?.[viewerIndex];
    if (!image) return;
    els.viewerImage.src = image.original;
    els.viewerImage.alt = `${viewerItem.title}, slika ${viewerIndex + 1}`;
    els.viewerDate.value = dateInputValue(image.takenAt);
    els.photoStage.querySelectorAll('.hotspot-pin').forEach((pin) => pin.remove());
    (image.hotspots || []).forEach((hotspot) => {
      const pin = document.createElement('div');
      pin.className = 'hotspot-pin';
      pin.style.left = `${hotspot.x}%`;
      pin.style.top = `${hotspot.y}%`;
      const link = safeHttpUrl(hotspot.link);
      pin.innerHTML = `<button class="hotspot-dot-button" type="button" aria-label="Oznaka: ${escape(hotspot.title)}"><span class="hotspot-dot"></span></button><div class="hotspot-card"><div class="hotspot-card-title"><span>${escape(hotspot.title)}</span><button class="hotspot-del" type="button" data-del-hs="${escape(hotspot.id)}" aria-label="Delete oznaku">×</button></div>${link ? `<a class="hotspot-card-link" href="${escape(link)}" target="_blank" rel="noopener noreferrer">Pogledaj detalje</a>` : ''}</div>`;
      els.photoStage.appendChild(pin);
    });
    els.thumbRail.innerHTML = viewerItem.images.map((entry, index) => `<button class="rail-thumb ${index === viewerIndex ? 'active' : ''}" type="button" data-rail="${index}" aria-label="Slika ${index + 1}"><img src="${escape(entry.thumbnail)}" alt=""></button>`).join('');
    $('prevImage').hidden = viewerItem.images.length < 2;
    $('nextImage').hidden = viewerItem.images.length < 2;
  }

  els.viewSwitcher.addEventListener('click', (event) => {
    const button = event.target.closest('[data-view]');
    if (button) setViewMode(button.dataset.view);
  });
  els.timelineSort.addEventListener('change', () => {
    timelineOrder = els.timelineSort.value === 'asc' ? 'asc' : 'desc';
    try { localStorage.setItem('noema-buildingsite-timeline-order', timelineOrder); } catch {}
    renderTimeline(getVisibleCollections());
  });
  els.timelineYears.addEventListener('click', (event) => {
    const button = event.target.closest('[data-timeline-year]');
    if (!button) return;
    scrollTimelineToYear(button.dataset.timelineYear);
  });
  els.timelineRange.addEventListener('input', (event) => {
    scrollTimelineToPercentage(event.target.value);
  });
  els.timelineFeed.addEventListener('click', (event) => {
    const card = event.target.closest('[data-timeline-site]');
    if (!card) return;
    const item = collections.find((entry) => entry.id === card.dataset.timelineSite);
    if (item) openViewer(item, Number(card.dataset.timelineIndex));
  });
  let timelineScrollFrame = 0;
  els.timelineFeed.addEventListener('scroll', () => {
    cancelAnimationFrame(timelineScrollFrame);
    timelineScrollFrame = requestAnimationFrame(() => {
      const feedTop = els.timelineFeed.getBoundingClientRect().top;
      const sections = [...els.timelineFeed.querySelectorAll('[data-year-section]')];
      if (!sections.length) return;
      const nearest = sections.reduce((best, section) => Math.abs(section.getBoundingClientRect().top - feedTop) < Math.abs(best.getBoundingClientRect().top - feedTop) ? section : best, sections[0]);
      if (nearest) els.timelineYears.querySelectorAll('.timeline-year').forEach((button) => button.classList.toggle('active', button.dataset.timelineYear === nearest.dataset.yearSection));
      
      const cards = [...els.timelineFeed.querySelectorAll('[data-timeline-position]')];
      const closestCard = cards.reduce((best, card) => Math.abs(card.getBoundingClientRect().top - feedTop) < Math.abs(best.getBoundingClientRect().top - feedTop) ? card : best, cards[0]);
      if (closestCard) {
        const photo = timelinePhotos[Number(closestCard.dataset.timelinePosition)];
        if (photo) els.timelineCursor.textContent = timelineCursorLabel(photo.timestamp);
      }

      const maxScroll = els.timelineFeed.scrollHeight - els.timelineFeed.clientHeight;
      const pct = maxScroll > 0 ? Math.min(100, Math.max(0, Math.round((els.timelineFeed.scrollTop / maxScroll) * 100))) : 0;
      els.timelineRange.value = String(pct);
    });
  });

  $('openAdd').addEventListener('click', () => {
    els.addForm.reset();
    resetFiles();
    els.error.textContent = '';
    updateFormLabelChips(els.addLabelChips, els.collectionLabel);
    openOverlay(els.addOverlay);
  });
  els.shareGallery.addEventListener('click', shareGallery);
  els.search.addEventListener('input', render);
  els.searchClear.addEventListener('click', () => { els.search.value = ''; render(); els.search.focus(); });
  els.gridRange.addEventListener('input', (event) => setGalleryColumns(event.target.value));
  els.albumGridRange.addEventListener('input', (event) => setAlbumColumns(event.target.value));
  els.albumBack.addEventListener('click', (event) => { event.preventDefault(); closeAlbum(); });
  els.albumGrid.addEventListener('click', (event) => {
    const feature = event.target.closest('[data-feature-image]');
    if (feature) {
      const item = collections.find((entry) => entry.id === currentAlbumId);
      if (!item || feature.dataset.featureImage === item.featuredImageId) return;
      feature.disabled = true;
      api(`/api/buildingsites/${encodeURIComponent(item.id)}`, {
        method: 'PATCH', body: JSON.stringify({ featuredImageId: feature.dataset.featureImage }),
      }).then((result) => {
        replaceCollection(result.buildingSite);
        render();
      }).catch((error) => {
        els.pageStatus.textContent = error.message;
      }).finally(() => { feature.disabled = false; });
      return;
    }
    const image = event.target.closest('[data-album-image]');
    if (!image) return;
    const item = collections.find((entry) => entry.id === currentAlbumId);
    if (item) openViewer(item, Number(image.dataset.albumImage));
  });
  els.labelFilters.addEventListener('click', (event) => { const button = event.target.closest('[data-label]'); if (button) { activeLabel = button.dataset.label; render(); } });
  els.tagFilters.addEventListener('click', (event) => { const button = event.target.closest('[data-tag]'); if (button) { activeTag = button.dataset.tag; render(); } });
  document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => closeOverlay($(button.dataset.close))));
  [els.addOverlay, els.editOverlay, els.viewerOverlay, els.hotspotOverlay].forEach((overlay) => overlay.addEventListener('click', (event) => { if (event.target === overlay) closeOverlay(overlay); }));
  els.fileInput.addEventListener('change', (event) => addFiles(event.target.files));
  ['dragenter', 'dragover'].forEach((name) => els.dropzone.addEventListener(name, (event) => { event.preventDefault(); els.dropzone.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach((name) => els.dropzone.addEventListener(name, (event) => { event.preventDefault(); els.dropzone.classList.remove('dragging'); }));
  els.dropzone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));
  els.lookupAddress.addEventListener('click', () => fillAddressFromCoordinates(els.locationInput, els.addressInput, els.lookupAddress, els.error));
  els.editLookupAddress.addEventListener('click', () => fillAddressFromCoordinates(els.editLocationInput, els.editAddressInput, els.editLookupAddress, els.editError));
  els.selected.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-file]');
    if (!button) return;
    pendingFiles.splice(Number(button.dataset.removeFile), 1);
    renderSelected();
  });

  els.addForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!pendingFiles.length) { els.error.textContent = 'Dodaj najmanje jednu sliku.'; return; }
    els.save.disabled = true;
    els.error.textContent = '';
    try {
      const images = [];
      for (let index = 0; index < pendingFiles.length; index += 1) {
        els.save.textContent = `Slika ${index + 1}/${pendingFiles.length}`;
        const file = pendingFiles[index];
        const metadata = await (fileMetadata.get(file) || Promise.resolve({ takenAt: '' }));
        images.push({ name: file.name, type: file.type, data: await fileBase64(file), thumbnailData: await thumbnailBase64(file), takenAt: metadata.takenAt });
      }
      const result = await api('/api/buildingsites', {
        method: 'POST',
        body: JSON.stringify({ title: els.title.value, location: els.locationInput.value, address: els.addressInput.value, documentUrl: els.link.value, label: els.collectionLabel.value, tags: parseTags(els.tagsInput.value), images }),
      });
      collections.unshift(result.buildingSite);
      closeOverlay(els.addOverlay);
      resetFiles();
      render();
    } catch (error) {
      els.error.textContent = error.message;
    } finally {
      els.save.disabled = false;
      els.save.textContent = 'Save';
    }
  });

  els.gallery.addEventListener('click', async (event) => {
    const album = event.target.closest('[data-album]');
    if (album) {
      event.preventDefault();
      const item = collections.find((entry) => entry.id === album.dataset.album);
      if (item) openAlbum(item);
      return;
    }
    const view = event.target.closest('[data-view]');
    const edit = event.target.closest('[data-edit]');
    const remove = event.target.closest('[data-delete]');
    const id = view?.dataset.view || edit?.dataset.edit || remove?.dataset.delete;
    if (!id) return;
    const item = collections.find((entry) => entry.id === id);
    if (!item) return;
    if (view) return openViewer(item, featuredImageIndex(item));
    if (edit) {
      editingId = id;
      els.editTitle.value = item.title;
      els.editLocationInput.value = item.location || item.sourceUrl || '';
      els.editAddressInput.value = item.address || '';
      els.editLink.value = item.documentUrl || '';
      els.editLabel.value = item.label || '';
      els.editTagsInput.value = formatTags(item.tags);
      els.editError.textContent = '';
      updateFormLabelChips(els.editLabelChips, els.editLabel);
      openOverlay(els.editOverlay);
      return;
    }
    if (remove && window.confirm(`Obrisati projekat „${item.title}“ i sve njegove slike?`)) {
      try {
        await api(`/api/buildingsites/${encodeURIComponent(id)}`, { method: 'DELETE' });
        collections = collections.filter((entry) => entry.id !== id);
        els.pageStatus.textContent = '';
        render();
      } catch (error) {
        els.pageStatus.textContent = error.message;
      }
    }
  });

  els.editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    els.editError.textContent = '';
    try {
      const result = await api(`/api/buildingsites/${encodeURIComponent(editingId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: els.editTitle.value, location: els.editLocationInput.value, address: els.editAddressInput.value, documentUrl: els.editLink.value, label: els.editLabel.value, tags: parseTags(els.editTagsInput.value) }),
      });
      replaceCollection(result.buildingSite);
      closeOverlay(els.editOverlay);
      render();
    } catch (error) {
      els.editError.textContent = error.message;
    }
  });

  els.viewerDate.addEventListener('change', async () => {
    const image = viewerItem?.images?.[viewerIndex];
    if (!image) return;
    els.viewerDate.disabled = true;
    els.viewerStatus.textContent = '';
    try {
      const result = await api(`/api/buildingsites/${encodeURIComponent(viewerItem.id)}/images/${encodeURIComponent(image.id)}`, {
        method: 'PATCH', body: JSON.stringify({ takenAt: els.viewerDate.value }),
      });
      replaceCollection(result.buildingSite);
      updateViewer();
      render();
    } catch (error) {
      els.viewerStatus.textContent = error.message;
      els.viewerDate.value = dateInputValue(image.takenAt);
    } finally {
      els.viewerDate.disabled = false;
    }
  });
  $('addHotspotBtn').addEventListener('click', () => {
    isAddingHotspot = !isAddingHotspot;
    if (!isAddingHotspot) return resetAddHotspotButton();
    $('addHotspotBtn').style.borderColor = 'var(--accent)';
    $('addHotspotBtn').style.color = 'var(--accent)';
    $('addHotspotBtn').textContent = 'Klikni na sliku';
    els.photoStage.classList.add('adding-hotspot');
  });
  els.photoStage.addEventListener('click', async (event) => {
    const deleteButton = event.target.closest('[data-del-hs]');
    if (deleteButton) {
      event.stopPropagation();
      const image = viewerItem.images[viewerIndex];
      els.viewerStatus.textContent = '';
      deleteButton.disabled = true;
      try {
        const result = await api(`/api/buildingsites/${encodeURIComponent(viewerItem.id)}/images/${encodeURIComponent(image.id)}/hotspots/${encodeURIComponent(deleteButton.dataset.delHs)}`, { method: 'DELETE' });
        replaceCollection(result.buildingSite);
        updateViewer();
        render();
      } catch (error) {
        els.viewerStatus.textContent = error.message;
        deleteButton.disabled = false;
      }
      return;
    }
    if (!isAddingHotspot || event.target.closest('.hotspot-pin')) return;
    const rect = els.viewerImage.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
    pendingHotspotPosition = {
      x: Number((((event.clientX - rect.left) / rect.width) * 100).toFixed(2)),
      y: Number((((event.clientY - rect.top) / rect.height) * 100).toFixed(2)),
    };
    els.hotspotForm.reset();
    els.hotspotError.textContent = '';
    openOverlay(els.hotspotOverlay);
  });
  els.hotspotForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const image = viewerItem?.images?.[viewerIndex];
    if (!image || !pendingHotspotPosition) return;
    els.hotspotError.textContent = '';
    const submit = els.hotspotForm.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      const result = await api(`/api/buildingsites/${encodeURIComponent(viewerItem.id)}/images/${encodeURIComponent(image.id)}/hotspots`, {
        method: 'POST', body: JSON.stringify({ ...pendingHotspotPosition, title: els.hotspotName.value, link: els.hotspotLink.value }),
      });
      replaceCollection(result.buildingSite);
      closeOverlay(els.hotspotOverlay);
      updateViewer();
      render();
    } catch (error) {
      els.hotspotError.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });

  $('prevImage').addEventListener('click', () => { viewerIndex = (viewerIndex - 1 + viewerItem.images.length) % viewerItem.images.length; updateViewer(); });
  $('nextImage').addEventListener('click', () => { viewerIndex = (viewerIndex + 1) % viewerItem.images.length; updateViewer(); });
  els.thumbRail.addEventListener('click', (event) => { const button = event.target.closest('[data-rail]'); if (button) { viewerIndex = Number(button.dataset.rail); updateViewer(); } });
  els.fullscreen.addEventListener('click', toggleViewerFullscreen);
  els.viewerOverlay.addEventListener('pointermove', (event) => { const rect = els.viewerOverlay.getBoundingClientRect(); if (viewerIsFullscreen() && event.clientY >= rect.bottom - Math.min(170, rect.height * 0.28)) revealViewerControls(); else hideViewerControls(); });
  let touchSx = 0, touchSy = 0, touchSt = 0;
  els.viewerOverlay.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    touchSx = e.touches[0].clientX; touchSy = e.touches[0].clientY; touchSt = Date.now();
  }, { passive: true });
  els.viewerOverlay.addEventListener('touchend', (e) => {
    if (!touchSx || !e.changedTouches.length || !viewerItem?.images?.length || viewerItem.images.length < 2) return;
    const dx = e.changedTouches[0].clientX - touchSx;
    const dy = e.changedTouches[0].clientY - touchSy;
    const dt = Date.now() - touchSt;
    touchSx = 0; touchSy = 0;
    if (Math.abs(dx) > 35 && Math.abs(dx) > Math.abs(dy) * 1.2 && dt < 500) {
      if (dx < 0) $('nextImage').click();
      else $('prevImage').click();
    }
  }, { passive: true });

  document.addEventListener('fullscreenchange', syncViewerFullscreen);
  window.addEventListener('popstate', syncAlbumFromLocation);
  window.addEventListener('hashchange', syncAlbumFromLocation);
  document.addEventListener('keydown', (event) => {
    const overlays = visibleOverlays();
    const topOverlay = overlays[overlays.length - 1];
    if (topOverlay) trapFocus(event, topOverlay);
    if (event.key === 'Escape' && topOverlay === els.viewerOverlay && viewerIsFullscreen()) { leaveViewerFullscreen(); return; }
    if (event.key === 'Escape' && topOverlay) { closeOverlay(topOverlay); return; }
    if (topOverlay === els.viewerOverlay && event.key === 'ArrowLeft') $('prevImage').click();
    if (topOverlay === els.viewerOverlay && event.key === 'ArrowRight') $('nextImage').click();
  });

  bindFormLabelChips(els.addLabelChips, els.collectionLabel);
  bindFormLabelChips(els.editLabelChips, els.editLabel);
  try {
    galleryColumns = Number(localStorage.getItem('noema-buildingsite-columns')) || 2;
    albumColumns = Number(localStorage.getItem('noema-buildingsite-album-columns')) || 4;
    currentViewMode = localStorage.getItem('noema-buildingsite-view') || 'grid';
    timelineOrder = localStorage.getItem('noema-buildingsite-timeline-order') === 'asc' ? 'asc' : 'desc';
  } catch {}
  setGalleryColumns(galleryColumns, false);
  setAlbumColumns(albumColumns, false);
  els.timelineSort.value = timelineOrder;
  setViewMode(currentViewMode, false);
  load();
})();
