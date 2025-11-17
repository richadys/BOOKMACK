/* =========================
   Bookmark Manager (Pro)
   Features:
   - Add / Edit / Delete
   - Archive / Unarchive
   - Drag & drop reorder (saved)
   - Export / Import JSON
   - Theme switch (saved)
   - Tags autocomplete & tag filter
   - Favicon fetch with caching
   - Undo delete via toast
   - Compact / Extended UI
   ========================= */

const LS_KEY = 'bm_v2_items';
const LS_UI = 'bm_v2_ui';

// ---------- State ----------
let state = {
  items: [],
  ui: {
    theme: 'dark',
    sort: 'new',
    view: 'all',
    search: '',
    activeTag: '__all',
    selected: new Set()
  }
};

// ---------- DOM ----------
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

const form = $('#form');
const titleInput = $('#title');
const urlInput = $('#url');
const tagsInput = $('#tags');
const notesInput = $('#notes');
const saveBtn = $('#saveBtn');
const clearBtn = $('#clearBtn');
const list = $('#list');
const resultCount = $('#resultCount');
const storageCount = $('#storageCount');
const searchInput = $('#search');
const sortSelect = $('#sort');
const viewSelect = $('#viewSelect');
const tagFilter = $('#tagFilter');
const newBtn = $('#newBtn');
const exportBtn = $('#exportBtn');
const importBtn = $('#importBtn');
const fileInput = $('#fileInput');
const themeToggle = $('#themeToggle');
const themeLabel = $('#themeLabel');
const modal = $('#modal');
const editForm = $('#editForm');
const editTitle = $('#editTitle');
const editUrl = $('#editUrl');
const editTags = $('#editTags');
const editNotes = $('#editNotes');
const editCancel = $('#editCancel');
const editSave = $('#editSave');
const tagSuggestions = $('#tagSuggestions');
const selectAllCheckbox = $('#selectAll');
const bulkArchive = $('#bulkArchive');
const bulkDelete = $('#bulkDelete');
const toast = document.getElementById('toast');

// ---------- Utils ----------
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const saveAll = () => {
  localStorage.setItem(LS_KEY, JSON.stringify(state.items));
  localStorage.setItem(LS_UI, JSON.stringify({ ...state.ui, selected: Array.from(state.ui.selected) }));
};
const loadAll = () => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const rawUI = localStorage.getItem(LS_UI);
    state.items = raw ? JSON.parse(raw) : [];
    if (rawUI) {
      const parsed = JSON.parse(rawUI);
      state.ui = { ...state.ui, ...parsed, selected: new Set(parsed.selected || []) };
    }
  } catch (e) { console.error('Load error', e); state.items = []; }
};
const normalizeTags = str => (String(str || '').split(',').map(t => t.trim()).filter(Boolean).map(t => t.toLowerCase()));
const formatDate = ms => new Date(ms).toLocaleString();
const isValidUrl = str => { try { const u = new URL(str); return u.protocol === 'http:' || u.protocol === 'https:' } catch (e) { return false; } };
const stringToColor = str => { let hash = 0; for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash); const c = (hash & 0x00FFFFFF).toString(16).toUpperCase(); return "#" + "00000".substring(0, 6 - c.length) + c; };

// ---------- Initial Load ----------
loadAll();
if (state.items.length === 0) {
  state.items.push({ id: uid(), title: 'MDN — URL', url: 'https://developer.mozilla.org/en-US/docs/Web/API/URL', tags: ['docs', 'web'], notes: 'Reference for URL API', archived: false, created: Date.now() - 86400000 });
  saveAll();
}

// ---------- Theme ----------
function applyTheme() {
  const root = document.documentElement;
  if (state.ui.theme === 'light') {
    root.style.setProperty('--bg', '#f7fafc');
    root.style.setProperty('--panel', '#ffffff');
    root.style.setProperty('--text', '#0b1220');
    themeToggle.checked = true;
    themeLabel.textContent = 'Light';
  } else {
    root.style.removeProperty('--bg');
    root.style.removeProperty('--panel');
    root.style.removeProperty('--text');
    themeToggle.checked = false;
    themeLabel.textContent = 'Dark';
  }
}
themeToggle.addEventListener('change', () => {
  state.ui.theme = themeToggle.checked ? 'light' : 'dark';
  saveAll(); applyTheme();
});
applyTheme();

// ---------- Filtering & Sorting ----------
function buildTagCounts() {
  const counts = {};
  state.items.forEach(i => i.tags.forEach(t => counts[t] = (counts[t] || 0) + 1));
  return counts;
}
function updateTagFilter() {
  const counts = buildTagCounts();
  tagFilter.innerHTML = `<option value="__all">All tags</option>`;
  Object.keys(counts).sort().forEach(tag => {
    const opt = document.createElement('option');
    opt.value = tag;
    opt.textContent = `${tag} (${counts[tag]})`;
    tagFilter.appendChild(opt);
  });
  if (state.ui.activeTag && state.ui.activeTag !== '__all') tagFilter.value = state.ui.activeTag;
}
function filteredItems() {
  let items = state.items.slice();
  if (state.ui.view === 'active') items = items.filter(i => !i.archived);
  if (state.ui.view === 'archived') items = items.filter(i => i.archived);
  if (state.ui.search) {
    const q = state.ui.search.toLowerCase();
    items = items.filter(i => (i.title + ' ' + i.notes + ' ' + i.tags.join(' ')).toLowerCase().includes(q));
  }
  if (state.ui.activeTag && state.ui.activeTag !== '__all') items = items.filter(i => i.tags.includes(state.ui.activeTag));
  items.sort((a, b) => {
    if (state.ui.sort === 'new') return b.created - a.created;
    if (state.ui.sort === 'old') return a.created - b.created;
    if (state.ui.sort === 'alpha') return a.title.localeCompare(b.title);
    if (state.ui.sort === 'alpha-desc') return b.title.localeCompare(a.title);
    return 0;
  });
  return items;
}

// ---------- Render ----------
function render() {
  list.innerHTML = '';
  const items = filteredItems();
  resultCount.textContent = `${items.length} results`;
  storageCount.textContent = state.items.length;

  items.forEach(it => {
    const card = document.createElement('div'); card.className = 'card'; card.draggable = true; card.dataset.id = it.id;

    // checkbox
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = state.ui.selected.has(it.id);
    cb.addEventListener('change', () => { cb.checked ? state.ui.selected.add(it.id) : state.ui.selected.delete(it.id); saveAll(); updateSelectAllCheckbox(); });

    // favicon
    const favicon = document.createElement('div'); favicon.className = 'favicon';
    const img = document.createElement('img'); img.src = `https://s2.googleusercontent.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(it.url)}&v=${it.id}`; img.alt = ''; img.onerror = () => { img.style.display = 'none'; };
    favicon.appendChild(img);

    // body
    const body = document.createElement('div'); body.className = 'card-body';
    const h3 = document.createElement('h3');
    const a = document.createElement('a'); a.href = it.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = it.title;
    h3.appendChild(a);
    const p = document.createElement('p'); p.textContent = formatDate(it.created) + (it.notes ? ' — ' + (it.notes.length > 80 ? it.notes.slice(0, 80) + '...' : it.notes) : '');
    const tagsWrap = document.createElement('div'); tagsWrap.className = 'tags';
    it.tags.forEach(t => {
      const tg = document.createElement('div'); tg.className = 'tag-pill'; tg.textContent = t;
      tg.style.backgroundColor = stringToColor(t);
      tg.addEventListener('click', e => { e.stopPropagation(); state.ui.activeTag = t; tagFilter.value = t; render(); saveAll(); });
      tagsWrap.appendChild(tg);
    });
    body.appendChild(h3); body.appendChild(p); body.appendChild(tagsWrap);

    // actions
    const actions = document.createElement('div'); actions.className = 'actions';
    const editBtn = document.createElement('button'); editBtn.className = 'edit'; editBtn.textContent = 'Edit'; editBtn.addEventListener('click', () => openEditModal(it.id));
    const archiveBtn = document.createElement('button'); archiveBtn.className = 'archive'; archiveBtn.textContent = it.archived ? 'Unarchive' : 'Archive'; archiveBtn.addEventListener('click', () => toggleArchive(it.id));
    const delBtn = document.createElement('button'); delBtn.className = 'delete'; delBtn.textContent = 'Delete'; delBtn.addEventListener('click', () => { if (confirm('Delete this bookmark?')) deleteOne(it.id); });
    actions.appendChild(editBtn); actions.appendChild(archiveBtn); actions.appendChild(delBtn);

    card.appendChild(cb); card.appendChild(favicon); card.appendChild(body); card.appendChild(actions);
    addDragHandlers(card);
    list.appendChild(card);
  });

  updateTagFilter();
  updateSelectAllCheckbox();
}

// ---------- Selection ----------
function filteredVisibleIds() { return filteredItems().map(i => i.id); }
function updateSelectAllCheckbox() {
  const visible = filteredVisibleIds();
  if (visible.length === 0) { selectAllCheckbox.indeterminate = false; selectAllCheckbox.checked = false; return; }
  const selectedCount = visible.filter(id => state.ui.selected.has(id)).length;
  selectAllCheckbox.checked = selectedCount === visible.length;
  selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < visible.length;
}

// ---------- CRUD ----------
form.addEventListener('submit', e => {
  e.preventDefault();
  const title = titleInput.value.trim(); const url = urlInput.value.trim();
  if (!title || !isValidUrl(url)) { alert('Provide a valid title and URL'); return; }
  const tags = normalizeTags(tagsInput.value); const notes = notesInput.value.trim();
  state.items.unshift({ id: uid(), title, url, tags, notes, archived: false, created: Date.now() });
  saveAll(); form.reset(); render();
});
clearBtn.addEventListener('click', () => form.reset());

function openEditModal(id) {
  const it = state.items.find(x => x.id === id); if (!it) return;
  editForm.dataset.editId = id;
  editTitle.value = it.title; editUrl.value = it.url; editTags.value = it.tags.join(', '); editNotes.value = it.notes;
  modal.setAttribute('aria-hidden', 'false'); modal.style.display = 'flex';
}
editCancel.addEventListener('click', () => closeEditModal());
editForm.addEventListener('submit', e => {
  e.preventDefault();
  const id = editForm.dataset.editId; const it = state.items.find(x => x.id === id); if (!it) return;
  it.title = editTitle.value.trim(); it.url = editUrl.value.trim(); it.tags = normalizeTags(editTags.value); it.notes = editNotes.value.trim();
  saveAll(); closeEditModal(); render();
});
function closeEditModal() { modal.setAttribute('aria-hidden', 'true'); modal.style.display = 'none'; delete editForm.dataset.editId; }

function toggleArchive(id) { const it = state.items.find(x => x.id === id); if (!it) return; it.archived = !it.archived; saveAll(); render(); }
let lastDeleted = null;
function deleteOne(id) { const idx = state.items.findIndex(x => x.id === id); if (idx < 0) return; lastDeleted = state.items[idx]; state.items.splice(idx, 1); state.ui.selected.delete(id); saveAll(); render(); showToast('Bookmark deleted', true); }

// ---------- Bulk ----------
bulkArchive.addEventListener('click', () => {
  const sel = Array.from(state.ui.selected); if (sel.length === 0) return alert('Select at least one item');
  state.items.forEach(i => { if (state.ui.selected.has(i.id)) i.archived = true; });
  state.ui.selected.clear(); saveAll(); render();
});
bulkDelete.addEventListener('click', () => {
  const sel = Array.from(state.ui.selected); if (sel.length === 0) return alert('Select at least one item');
  if (!confirm(`Delete ${sel.length} bookmarks?`)) return;
  state.items = state.items.filter(i => !state.ui.selected.has(i.id));
  state.ui.selected.clear(); saveAll(); render();
});
selectAllCheckbox.addEventListener('change', e => {
  const visible = filteredVisibleIds();
  if (e.target.checked) visible.forEach(id => state.ui.selected.add(id)); else visible.forEach(id => state.ui.selected.delete(id));
  saveAll(); render();
});

// ---------- Drag & Drop ----------
let dragSrcEl = null;
function addDragHandlers(el) {
  el.addEventListener('dragstart', (e) => { dragSrcEl = el; el.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', el.dataset.id); });
  el.addEventListener('dragend', () => { el.classList.remove('dragging'); dragSrcEl = null; });
  el.addEventListener('dragover', e => { e.preventDefault(); const rect = el.getBoundingClientRect(); const after = (e.clientY - rect.top) > (rect.height / 2); el.style.borderTop = after ? '' : '2px dashed rgba(255,255,255,0.08)'; el.style.borderBottom = after ? '2px dashed rgba(255,255,255,0.08)' : ''; });
  el.addEventListener('dragleave', () => { el.style.borderTop = ''; el.style.borderBottom = ''; });
  el.addEventListener('drop', e => {
    e.preventDefault(); el.style.borderTop = ''; el.style.borderBottom = '';
    const srcId = e.dataTransfer.getData('text/plain'); const dstId = el.dataset.id; if (!srcId || srcId === dstId) return;
    const srcIndex = state.items.findIndex(i => i.id === srcId); const dstIndex = state.items.findIndex(i => i.id === dstId); if (srcIndex < 0 || dstIndex < 0) return;
    const dstEl = document.querySelector(`.card[data-id="${dstId}"]`); const rect = dstEl.getBoundingClientRect(); const after = (e.clientY - rect.top) > (rect.height / 2);
    const moving = state.items.splice(srcIndex, 1)[0];
    const newIndex = (srcIndex < dstIndex) ? (after ? dstIndex : dstIndex) : (after ? dstIndex + 1 : dstIndex);
    state.items.splice(newIndex, 0, moving); saveAll(); render();
  });
}

// ---------- Export / Import ----------
exportBtn.addEventListener('click', () => {
  const data = JSON.stringify(state.items, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'bookmarks.json'; a.click(); URL.revokeObjectURL(url);
});
importBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const arr = JSON.parse(ev.target.result); if (!Array.isArray(arr)) throw new Error('Invalid JSON');
      let added = 0;
      arr.forEach(it => {
        if (!it.url || !it.title) return;
        if (!it.id) it.id = uid();
        if (!it.created) it.created = Date.now();
        if (!Array.isArray(it.tags)) it.tags = normalizeTags(it.tags || '');
        const exists = state.items.find(x => x.url === it.url);
        if (!exists) { state.items.unshift(it); added++; } else { exists.tags = Array.from(new Set([...(exists.tags || []), ...(it.tags || [])])); if (it.notes && !exists.notes) exists.notes = it.notes; }
      });
      saveAll(); render(); alert(`Imported ${added} new items (duplicates merged).`);
    } catch (err) { alert('Import failed: ' + err.message); }
  };
  reader.readAsText(f); fileInput.value = '';
});

// ---------- Tags autocomplete ----------
tagsInput.addEventListener('input', e => {
  const q = e.target.value.split(',').pop().trim().toLowerCase();
  if (!q) { tagSuggestions.style.display = 'none'; return; }
  const allTags = Array.from(new Set(state.items.flatMap(i => i.tags)));
  const matches = allTags.filter(t => t.includes(q)).slice(0, 8);
  if (matches.length === 0) { tagSuggestions.style.display = 'none'; return; }
  tagSuggestions.innerHTML = '';
  matches.forEach(t => {
    const el = document.createElement('div'); el.className = 'tag'; el.textContent = t;
    el.addEventListener('click', () => {
      const parts = tagsInput.value.split(','); parts[parts.length - 1] = ' ' + t; tagsInput.value = parts.map(p => p.trim()).filter(Boolean).join(', '); tagSuggestions.style.display = 'none'; tagsInput.focus();
    });
    tagSuggestions.appendChild(el);
  });
  tagSuggestions.style.display = 'block';
});
document.addEventListener('click', e => { if (!e.target.closest('.tag-autocomplete')) tagSuggestions.style.display = 'none'; });

// ---------- Filters / Search / Sort ----------
searchInput.addEventListener('input', e => { state.ui.search = e.target.value.trim(); render(); saveAll(); });
sortSelect.addEventListener('change', e => { state.ui.sort = e.target.value; render(); saveAll(); });
viewSelect.addEventListener('change', e => { state.ui.view = e.target.value; render(); saveAll(); });
tagFilter.addEventListener('change', e => { state.ui.activeTag = e.target.value; render(); saveAll(); });

// ---------- Keyboard Shortcuts ----------
window.addEventListener('keydown', e => {
  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); titleInput.focus(); }
  if (e.key === '/') { e.preventDefault(); searchInput.focus(); }
  if (e.key === 'Escape') closeEditModal();
});

// ---------- New Button ----------
newBtn.addEventListener('click', () => titleInput.focus());

// ---------- Toast / Undo ----------
function showToast(message, undo = false) {
  toast.innerHTML = message;
  if (undo && lastDeleted) {
    const btn = document.createElement('button'); btn.textContent = 'Undo';
    btn.addEventListener('click', () => { state.items.unshift(lastDeleted); lastDeleted = null; saveAll(); render(); hideToast(); });
    toast.appendChild(btn);
  }
  toast.classList.remove('hidden');
  setTimeout(hideToast, 4000);
}
function hideToast() { toast.classList.add('hidden'); toast.innerHTML = ''; }

// ---------- UI Mode ----------
const uiModeToggle = document.createElement('button'); uiModeToggle.className = 'btn ghost'; uiModeToggle.textContent = 'Toggle Compact';
document.querySelector('.header-actions').appendChild(uiModeToggle);
let uiMode = localStorage.getItem('bm_ui_mode') || 'extended';
document.body.classList.add(uiMode);
uiModeToggle.addEventListener('click', () => {
  document.body.classList.toggle('compact');
  document.body.classList.toggle('extended');
  uiMode = document.body.classList.contains('compact') ? 'compact' : 'extended';
  localStorage.setItem('bm_ui_mode', uiMode);
});

function showToast(message, undo = false) {
  toast.innerHTML = message;
  if (undo && lastDeleted) {
    const btn = document.createElement('button'); 
    btn.textContent = 'Undo';
    btn.addEventListener('click', () => { 
      state.items.unshift(lastDeleted); 
      lastDeleted = null; 
      saveAll(); 
      render(); 
      hideToast(); 
    });
    toast.appendChild(btn);
  }
  toast.classList.add('show');      // slide in
  setTimeout(hideToast, 4000);
}

function hideToast() { 
  toast.classList.remove('show');   // slide out
  setTimeout(()=>{ toast.innerHTML = ''; }, 400); // clean content after animation
}

// ---------- Init ----------
sortSelect.value = state.ui.sort;
viewSelect.value = state.ui.view;
searchInput.value = state.ui.search || '';
tagFilter.value = state.ui.activeTag || '__all';
applyTheme();
render();
