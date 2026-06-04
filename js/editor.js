/* =============================================
   In-place Editor
   — Whole-section add / remove
   — Section header + nav link editing
   — Content block add / remove
   — Staff CRUD
   — A/B section color management
   — localStorage persistence, no server
   ============================================= */

const STORE = 'pcc-worship';
// Saved shape:
// {
//   sectionHeaders: { [id]: { eyebrow, title, desc } },
//   deletedSections: ['section-id', ...],
//   custom: [{ id, eyebrow, title, desc, blocks:[{label,html}] }],
//   content: { 'content-welcome': html, [contentId]: [{label,html}] },
//   staff: [{ name, role, email, photo }]
// }

// Built-in sections (excluding #welcome which is fixed hero, #staff which is data-driven)
const BUILTIN_EDITABLE = ['how-it-works','on-site','team-life','guidelines'];
const CONTENT_GRID_IDS = ['content-how-it-works','content-on-site','content-team-life','content-guidelines'];

let editMode = false;
let snapshot = {};

/* ═══════════════════════════════════════════
   A/B SECTION COLORS
   ═══════════════════════════════════════════ */

function updateSectionColors() {
  const sections = [...document.querySelectorAll('.page-wrap .section')]
    .filter(s => s.id !== 'welcome');
  sections.forEach((s, i) => s.classList.toggle('section--alt', i % 2 !== 0));
}

/* ═══════════════════════════════════════════
   PERSISTENCE
   ═══════════════════════════════════════════ */

function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; }
}

function persist() {
  const store = loadStore();

  // Section headers
  store.sectionHeaders = store.sectionHeaders || {};
  document.querySelectorAll('.section:not(#welcome):not(#staff)').forEach(section => {
    store.sectionHeaders[section.id] = {
      eyebrow: section.querySelector('.section-header .eyebrow')?.textContent?.trim() || '',
      title:   section.querySelector('.section-header h2')?.textContent?.trim() || '',
      desc:    section.querySelector('.section-header p')?.textContent?.trim() || '',
    };
  });

  // Content blocks
  store.content = store.content || {};
  const welcome = document.getElementById('content-welcome');
  if (welcome) store.content['content-welcome'] = welcome.innerHTML;

  CONTENT_GRID_IDS.forEach(cid => {
    const grid = document.getElementById(cid);
    if (!grid) return;
    store.content[cid] = [...grid.querySelectorAll('.section-block')].map(block => ({
      label: block.querySelector('.section-label')?.textContent?.trim() || '',
      html:  block.querySelector('.content-body')?.innerHTML || '',
    }));
  });

  // Custom sections
  store.custom = [...document.querySelectorAll('.section.section--custom')].map(section => {
    const cid = 'content-' + section.id;
    const grid = document.getElementById(cid);
    return {
      id:     section.id,
      eyebrow: section.querySelector('.section-header .eyebrow')?.textContent?.trim() || '',
      title:   section.querySelector('.section-header h2')?.textContent?.trim() || '',
      desc:    section.querySelector('.section-header p')?.textContent?.trim() || '',
      blocks: grid
        ? [...grid.querySelectorAll('.section-block')].map(b => ({
            label: b.querySelector('.section-label')?.textContent?.trim() || '',
            html:  b.querySelector('.content-body')?.innerHTML || '',
          }))
        : [],
    };
  });

  // Staff
  const staffGrid = document.querySelector('#content-staff .staff-grid');
  if (staffGrid) {
    store.staff = [...staffGrid.querySelectorAll('.staff-card')].map(card => ({
      name:  card.querySelector('.staff-card__name')?.textContent?.trim()  || '',
      role:  card.querySelector('.staff-card__role')?.textContent?.trim()  || '',
      email: card.querySelector('.staff-card__email')?.textContent?.trim() || '',
      photo: card.querySelector('img.staff-card__photo')?.getAttribute('src') || '',
    }));
  }

  // Track which built-ins are deleted
  store.deletedSections = BUILTIN_EDITABLE.filter(id =>
    !document.getElementById(id)
  );

  localStorage.setItem(STORE, JSON.stringify(store));
}

/** Called by load-content.js after all markdown loads */
function applySaved() {
  const store = loadStore();

  // Restore section headers
  if (store.sectionHeaders) {
    Object.entries(store.sectionHeaders).forEach(([id, data]) => {
      const section = document.getElementById(id);
      if (!section) return;
      const eyebrow = section.querySelector('.section-header .eyebrow');
      const h2      = section.querySelector('.section-header h2');
      const desc    = section.querySelector('.section-header p');
      if (eyebrow) eyebrow.textContent = data.eyebrow;
      if (h2)      h2.textContent      = data.title;
      if (desc)    desc.textContent    = data.desc;
      // Sync nav link
      const link = document.querySelector(`.sidebar-link[href="#${id}"]`);
      if (link && data.title) link.textContent = data.title;
    });
  }

  // Restore content blocks (welcome + grids)
  if (store.content) {
    const welcome = document.getElementById('content-welcome');
    if (welcome && store.content['content-welcome']) {
      welcome.innerHTML = store.content['content-welcome'];
    }
    CONTENT_GRID_IDS.forEach(cid => {
      const blocks = store.content[cid];
      if (!Array.isArray(blocks)) return;
      const grid = document.getElementById(cid);
      if (!grid) return;
      grid.innerHTML = '';
      blocks.forEach(({ label, html }) =>
        grid.appendChild(window.createSectionBlock(label, html))
      );
    });
  }

  // Remove deleted built-in sections
  if (store.deletedSections) {
    store.deletedSections.forEach(id => {
      const section = document.getElementById(id);
      if (section) section.remove();
      const navItem = document.querySelector(`#sidebarNav li[data-for="${id}"]`);
      if (navItem) navItem.remove();
    });
  }

  // Inject custom sections
  if (store.custom && store.custom.length) {
    const footer = document.querySelector('.page-wrap footer');
    store.custom.forEach(data => {
      if (!document.getElementById(data.id)) {
        const section = buildSection(data);
        footer.parentNode.insertBefore(section, footer);
        addNavLink(data.id, data.title);
      }
    });
  }

  // Restore custom section content blocks
  if (store.custom) {
    store.custom.forEach(data => {
      const grid = document.getElementById('content-' + data.id);
      if (!grid || !data.blocks) return;
      grid.innerHTML = '';
      data.blocks.forEach(({ label, html }) =>
        grid.appendChild(window.createSectionBlock(label, html))
      );
    });
  }

  updateSectionColors();
}
window.__editorApplySaved = applySaved;

/* ═══════════════════════════════════════════
   SECTION BUILDER
   ═══════════════════════════════════════════ */

function buildSection({ id, eyebrow, title, desc, blocks }) {
  const section = document.createElement('section');
  section.id = id;
  section.className = 'section section--custom';

  const contentId = 'content-' + id;
  section.innerHTML = `
    <div class="section-header">
      <div class="section-header__inner">
        <span class="eyebrow">${eyebrow || 'Category'}</span>
        <h2>${title || 'New Section'}</h2>
        <p>${desc || 'Section description'}</p>
      </div>
    </div>
    <div class="section-body">
      <div class="section-body__inner">
        <div id="${contentId}" class="sections-grid"></div>
      </div>
    </div>
  `;

  if (blocks && blocks.length) {
    const grid = section.querySelector('.sections-grid');
    blocks.forEach(({ label, html }) =>
      grid.appendChild(window.createSectionBlock(label, html))
    );
  }

  return section;
}

function addNavLink(id, title) {
  const nav = document.getElementById('sidebarNav');
  if (!nav || document.querySelector(`#sidebarNav li[data-for="${id}"]`)) return;
  const li = document.createElement('li');
  li.dataset.for = id;
  const a = document.createElement('a');
  a.href = `#${id}`;
  a.className = 'sidebar-link';
  a.textContent = title || 'New Section';
  li.appendChild(a);
  nav.appendChild(li);
}

/* ═══════════════════════════════════════════
   SNAPSHOT (for cancel)
   ═══════════════════════════════════════════ */

function takeSnapshot() {
  snapshot.pageHTML    = document.querySelector('.page-wrap').innerHTML;
  snapshot.navHTML     = document.getElementById('sidebarNav').innerHTML;
}

function restoreSnapshot() {
  document.querySelector('.page-wrap').innerHTML    = snapshot.pageHTML;
  document.getElementById('sidebarNav').innerHTML  = snapshot.navHTML;
  updateSectionColors();
}

/* ═══════════════════════════════════════════
   EDIT MODE
   ═══════════════════════════════════════════ */

function enterEdit() {
  editMode = true;
  takeSnapshot();
  document.body.classList.add('edit-mode');

  // Welcome content
  const welcome = document.getElementById('content-welcome');
  if (welcome) { welcome.contentEditable = 'true'; welcome.spellcheck = true; }

  // All non-welcome, non-staff sections
  document.querySelectorAll('.section:not(#welcome):not(#staff)').forEach(section => {
    enableSectionHeader(section);
    initBlockControls('content-' + section.id);
    addSectionDeleteBtn(section);
  });

  // Staff
  initStaffControls();

  // "Add section" button before footer
  const addBtn = document.createElement('button');
  addBtn.className = 'ec add-section-btn';
  addBtn.innerHTML = `<span style="font-size:1.2rem;font-weight:300">+</span> Add new section`;
  addBtn.addEventListener('click', () => {
    const id = 'custom-' + Date.now();
    const data = { id, eyebrow: 'Category', title: 'New Section', desc: 'Section description', blocks: [] };
    const section = buildSection(data);
    section.classList.add('section--custom');
    const footer = document.querySelector('.page-wrap footer');
    footer.parentNode.insertBefore(section, footer);
    addNavLink(id, data.title);
    updateSectionColors();
    // Wire up editing on the new section
    enableSectionHeader(section);
    initBlockControls('content-' + id);
    addSectionDeleteBtn(section);
    // Focus the h2
    const h2 = section.querySelector('h2');
    if (h2) { h2.focus(); selectAll(h2); }
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  const footer = document.querySelector('.page-wrap footer');
  footer.parentNode.insertBefore(addBtn, footer);

  document.getElementById('fabIdle').hidden   = true;
  document.getElementById('fabActive').hidden = false;
}

function exitEdit(doSave) {
  if (doSave) {
    persist();
    showToast('Changes saved');
  } else {
    restoreSnapshot();
  }

  editMode = false;
  document.body.classList.remove('edit-mode');

  // Remove all edit-control elements
  document.querySelectorAll('.ec').forEach(el => el.remove());

  // Remove contenteditable from all fields
  document.querySelectorAll('[contenteditable]').forEach(el => {
    el.removeAttribute('contenteditable');
  });

  // Restore staff email links
  document.querySelectorAll('.staff-card').forEach(card => {
    const span = card.querySelector('span.staff-card__email');
    if (span) {
      const addr = span.textContent.trim();
      const a = document.createElement('a');
      a.className = 'staff-card__email';
      a.href = `mailto:${addr}`;
      a.textContent = addr;
      span.replaceWith(a);
    }
  });

  document.getElementById('fabIdle').hidden   = false;
  document.getElementById('fabActive').hidden = true;
  hideToolbar();
}

/* ═══════════════════════════════════════════
   SECTION HEADER EDITING + NAV SYNC
   ═══════════════════════════════════════════ */

function enableSectionHeader(section) {
  const eyebrow = section.querySelector('.section-header .eyebrow');
  const h2      = section.querySelector('.section-header h2');
  const desc    = section.querySelector('.section-header p');

  [eyebrow, h2, desc].forEach(el => {
    if (!el) return;
    el.contentEditable = 'true';
    el.spellcheck = false;
  });

  // Live-sync the nav link as h2 is typed
  if (h2) {
    h2.addEventListener('input', () => {
      const link = document.querySelector(`.sidebar-link[href="#${section.id}"]`);
      if (link) link.textContent = h2.textContent;
    });
  }
}

function addSectionDeleteBtn(section) {
  const btn = document.createElement('button');
  btn.className = 'ec section-delete-btn';
  btn.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Remove section`;
  btn.addEventListener('click', () => {
    const title = section.querySelector('h2')?.textContent?.trim() || 'this section';
    if (!confirm(`Remove "${title}"?`)) return;
    const navItem = document.querySelector(`#sidebarNav li[data-for="${section.id}"]`);
    if (navItem) navItem.remove();
    section.remove();
    updateSectionColors();
  });
  const header = section.querySelector('.section-header');
  if (header) header.appendChild(btn);
}

/* ═══════════════════════════════════════════
   BLOCK MANAGEMENT
   ═══════════════════════════════════════════ */

function initBlockControls(contentId) {
  const grid = document.getElementById(contentId);
  if (!grid) return;

  grid.querySelectorAll('.section-block').forEach(enableBlock);

  const addBtn = document.createElement('button');
  addBtn.className = 'ec add-block-btn';
  addBtn.innerHTML = `<span class="add-block-icon">+</span> Add block`;
  addBtn.addEventListener('click', () => {
    const block = window.createSectionBlock('Label', '<p>Enter content…</p>');
    enableBlock(block);
    grid.insertBefore(block, addBtn);
    const label = block.querySelector('.section-label');
    if (label) { label.focus(); selectAll(label); }
  });
  grid.appendChild(addBtn);
}

function enableBlock(block) {
  const label = block.querySelector('.section-label');
  const body  = block.querySelector('.content-body');
  if (label) { label.contentEditable = 'true'; label.spellcheck = false; }
  if (body)  { body.contentEditable  = 'true'; body.spellcheck  = true;  }

  const del = document.createElement('button');
  del.className = 'ec block-delete-btn';
  del.title = 'Remove block';
  del.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  del.addEventListener('click', () => {
    if (confirm('Remove this block?')) block.remove();
  });
  block.appendChild(del);
}

function selectAll(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

/* ═══════════════════════════════════════════
   STAFF MANAGEMENT
   ═══════════════════════════════════════════ */

function initStaffControls() {
  const grid = document.querySelector('#content-staff .staff-grid');
  if (!grid) return;
  grid.querySelectorAll('.staff-card').forEach(enableStaffCard);

  const addCard = document.createElement('div');
  addCard.className = 'ec staff-add-card';
  addCard.innerHTML = `<div class="staff-add-card__icon">+</div><span>Add staff member</span>`;
  addCard.addEventListener('click', () => {
    const idx  = grid.querySelectorAll('.staff-card').length;
    const card = window.buildStaffCard({ name: 'Name', role: 'Role', email: '', photo: '' }, idx);
    grid.insertBefore(card, addCard);
    enableStaffCard(card);
    const nameEl = card.querySelector('.staff-card__name');
    if (nameEl) { nameEl.focus(); selectAll(nameEl); }
  });
  grid.appendChild(addCard);
}

function enableStaffCard(card) {
  ['staff-card__name', 'staff-card__role'].forEach(cls => {
    const el = card.querySelector(`.${cls}`);
    if (el) { el.contentEditable = 'true'; el.spellcheck = false; }
  });

  // Swap email link → editable span
  const emailLink = card.querySelector('a.staff-card__email');
  if (emailLink) {
    const span = document.createElement('span');
    span.className = 'staff-card__email';
    span.contentEditable = 'true';
    span.spellcheck = false;
    span.textContent = emailLink.textContent;
    emailLink.replaceWith(span);
  } else {
    const emailSpan = card.querySelector('span.staff-card__email');
    if (emailSpan) { emailSpan.contentEditable = 'true'; emailSpan.spellcheck = false; }
  }

  // Photo click → file picker
  const photo = card.querySelector('.staff-card__photo, .staff-card__photo-placeholder');
  if (photo && !photo.dataset.photoWired) {
    photo.dataset.photoWired = '1';
    photo.title = 'Click to change photo';
    photo.style.cursor = 'pointer';
    photo.addEventListener('click', () => triggerPhotoUpload(card));
  }

  // Delete
  const del = document.createElement('button');
  del.className = 'ec staff-delete-btn';
  del.title = 'Remove';
  del.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  del.addEventListener('click', () => {
    const name = card.querySelector('.staff-card__name')?.textContent || 'this person';
    if (confirm(`Remove ${name}?`)) card.remove();
  });
  card.appendChild(del);
}

function triggerPhotoUpload(card) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const existing = card.querySelector('.staff-card__photo, .staff-card__photo-placeholder');
      const img = document.createElement('img');
      img.className = 'staff-card__photo';
      img.src = e.target.result;
      img.alt = card.querySelector('.staff-card__name')?.textContent || '';
      img.dataset.photoWired = '1';
      img.title = 'Click to change photo';
      img.style.cursor = 'pointer';
      img.addEventListener('click', () => triggerPhotoUpload(card));
      if (existing) existing.replaceWith(img); else card.prepend(img);
    };
    reader.readAsDataURL(file);
  });
  input.click();
}

/* ═══════════════════════════════════════════
   FORMAT TOOLBAR
   ═══════════════════════════════════════════ */

const toolbar = document.getElementById('format-toolbar');

function showToolbar() {
  toolbar.removeAttribute('hidden');
  toolbar.removeAttribute('aria-hidden');
  toolbar.classList.add('visible');
}
function hideToolbar() {
  toolbar.setAttribute('aria-hidden', 'true');
  toolbar.classList.remove('visible');
}
function positionToolbar(rect) {
  requestAnimationFrame(() => {
    let top  = rect.top + window.scrollY - toolbar.offsetHeight - 8;
    let left = rect.left + window.scrollX + rect.width / 2 - toolbar.offsetWidth / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - toolbar.offsetWidth - 8));
    if (top < window.scrollY + 8) top = rect.bottom + window.scrollY + 8;
    toolbar.style.top  = top + 'px';
    toolbar.style.left = left + 'px';
  });
}

document.addEventListener('selectionchange', () => {
  if (!editMode) return;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) { hideToolbar(); return; }
  let node = sel.anchorNode;
  while (node && node.nodeType !== 1) node = node.parentNode;
  if (node?.closest('.ec, .section-label, .section-header .eyebrow')) { hideToolbar(); return; }
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  if (!rect.width) { hideToolbar(); return; }
  showToolbar();
  requestAnimationFrame(() => positionToolbar(rect));
});

toolbar.addEventListener('mousedown', e => {
  const btn = e.target.closest('button[data-cmd]');
  if (!btn) return;
  e.preventDefault();
  const cmd = btn.dataset.cmd;
  if      (cmd === 'h2')           document.execCommand('formatBlock', false, '<h2>');
  else if (cmd === 'h3')           document.execCommand('formatBlock', false, '<h3>');
  else if (cmd === 'p')            document.execCommand('formatBlock', false, '<p>');
  else if (cmd === 'ul')           document.execCommand('insertUnorderedList');
  else if (cmd === 'ol')           document.execCommand('insertOrderedList');
  else if (cmd === 'removeFormat') { document.execCommand('removeFormat'); document.execCommand('formatBlock', false, '<p>'); }
  else                             document.execCommand(cmd);
});

/* ═══════════════════════════════════════════
   TOAST
   ═══════════════════════════════════════════ */

function showToast(msg) {
  let t = document.getElementById('editor-toast');
  if (!t) { t = document.createElement('div'); t.id = 'editor-toast'; t.className = 'editor-toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ═══════════════════════════════════════════
   BUTTON WIRING & KEYS
   ═══════════════════════════════════════════ */

document.getElementById('editBtn').addEventListener('click', enterEdit);
document.getElementById('saveBtn').addEventListener('click', () => exitEdit(true));
document.getElementById('cancelBtn').addEventListener('click', () => {
  if (confirm('Discard unsaved changes?')) exitEdit(false);
});
document.addEventListener('keydown', e => {
  if (!editMode) return;
  if (e.key === 'Escape') exitEdit(false);
  if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); exitEdit(true); }
});

/* ═══════════════════════════════════════════
   INIT — run A/B colors on every page load
   ═══════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', updateSectionColors);
