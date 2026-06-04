/* =============================================
   Helpers
   ============================================= */
function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: text };
  const data = {};
  match[1].split('\n').forEach(line => {
    const colon = line.indexOf(':');
    if (colon === -1) return;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim().replace(/^["']|["']$/g, '');
    data[key] = val;
  });
  return { data, body: match[2] };
}

async function fetchMd(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(res.status);
  return parseFrontmatter(await res.text());
}

/** Shared block builder — used by both loader and editor */
function createSectionBlock(label, html) {
  const block = document.createElement('div');
  block.className = 'section-block';
  const labelEl = document.createElement('div');
  labelEl.className = 'section-label';
  labelEl.textContent = label;
  const body = document.createElement('div');
  body.className = 'content-body';
  body.innerHTML = html;
  block.appendChild(labelEl);
  block.appendChild(body);
  return block;
}
window.createSectionBlock = createSectionBlock; // expose for editor

/** Build a staff card element from a data object */
function buildStaffCard(person, index) {
  const card = document.createElement('article');
  card.className = 'staff-card';
  card.dataset.index = String(index);
  const initials = (person.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('');
  card.innerHTML = `
    ${person.photo
      ? `<img class="staff-card__photo" src="${person.photo}" alt="${person.name}" loading="lazy">`
      : `<div class="staff-card__photo-placeholder">${initials}</div>`}
    <span class="staff-card__name">${person.name || ''}</span>
    <span class="staff-card__role">${person.role || ''}</span>
    ${person.email
      ? `<a  class="staff-card__email" href="mailto:${person.email}">${person.email}</a>`
      : `<span class="staff-card__email"></span>`}
  `;
  return card;
}
window.buildStaffCard = buildStaffCard;

/* =============================================
   Content loaders
   ============================================= */
async function loadWelcome() {
  const el = document.getElementById('content-welcome');
  try {
    const { body } = await fetchMd('/content/welcome.md');
    el.innerHTML = marked.parse(body);
  } catch {
    el.innerHTML = '<p class="loading">Content unavailable.</p>';
  }
}

async function loadStaff() {
  const container = document.getElementById('content-staff');
  try {
    // Check for editor-saved staff first
    const saved = JSON.parse(localStorage.getItem('pcc-worship-staff') || 'null');
    let people;
    if (saved && saved.length) {
      people = saved;
    } else {
      const res = await fetch('/content/staff/index.json');
      if (!res.ok) throw new Error(res.status);
      const { staff } = await res.json();
      people = await Promise.all(
        staff.map(slug => fetchMd(`/content/staff/${slug}.md`).then(f => f.data))
      );
    }

    const grid = document.createElement('div');
    grid.className = 'staff-grid';
    people.forEach((p, i) => grid.appendChild(buildStaffCard(p, i)));
    container.innerHTML = '';
    container.appendChild(grid);
  } catch {
    container.innerHTML = '<p class="loading">Staff directory unavailable.</p>';
  }
}

async function loadSections(containerId, sections) {
  const container = document.getElementById(containerId);
  try {
    const results = await Promise.all(sections.map(async s => {
      const { body } = await fetchMd(s.file);
      return { label: s.label, html: marked.parse(body) };
    }));
    container.innerHTML = '';
    results.forEach(({ label, html }) => {
      container.appendChild(createSectionBlock(label, html));
    });
  } catch {
    container.innerHTML = '<p class="loading">Content unavailable.</p>';
  }
}

/* =============================================
   Scroll spy
   ============================================= */
function initScrollSpy() {
  const sections = document.querySelectorAll('.section[id]');
  const links = document.querySelectorAll('.sidebar-link');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        links.forEach(l => l.classList.remove('active'));
        const active = document.querySelector(`.sidebar-link[href="#${entry.target.id}"]`);
        if (active) active.classList.add('active');
      }
    });
  }, { rootMargin: '0px 0px -80% 0px', threshold: 0 });
  sections.forEach(s => observer.observe(s));
}

/* =============================================
   Mobile menu
   ============================================= */
function initMobileMenu() {
  const toggle = document.getElementById('menuToggle');
  const sidebar = document.getElementById('sidebar');
  if (!toggle || !sidebar) return;
  toggle.addEventListener('click', () => document.body.classList.toggle('menu-open'));
  sidebar.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', () => document.body.classList.remove('menu-open'));
  });
  document.addEventListener('click', e => {
    if (document.body.classList.contains('menu-open') &&
        !sidebar.contains(e.target) && !toggle.contains(e.target)) {
      document.body.classList.remove('menu-open');
    }
  });
}

/* =============================================
   Smooth scroll
   ============================================= */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      const offset = window.innerWidth <= 720 ? 52 : 0;
      window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' });
    });
  });
}

/* =============================================
   Boot
   ============================================= */
document.addEventListener('DOMContentLoaded', () => {
  loadStaff();

  // Load all text sections, then apply any editor overrides
  Promise.allSettled([
    loadWelcome(),
    loadSections('content-how-it-works', [
      { label: 'Getting Started', file: '/content/shadowing.md' },
      { label: 'Scheduling',      file: '/content/scheduling.md' },
      { label: 'Songs',           file: '/content/songs.md' },
      { label: 'Rehearsals',      file: '/content/rehearsals.md' },
    ]),
    loadSections('content-on-site', [
      { label: 'Availability',  file: '/content/blockout.md' },
      { label: 'Call Times',    file: '/content/calltimes.md' },
      { label: 'Cancellations', file: '/content/cancellations.md' },
      { label: 'Parking',       file: '/content/parking.md' },
    ]),
    loadSections('content-team-life', [
      { label: 'In-Ear Monitors', file: '/content/iems.md' },
      { label: 'Wristbands',      file: '/content/wristbands.md' },
      { label: 'Green Room',      file: '/content/greenroom.md' },
      { label: 'Band Seating',    file: '/content/seating.md' },
      { label: 'Stage Presence',  file: '/content/stagepresence.md' },
    ]),
    loadSections('content-guidelines', [
      { label: 'FOBs & Credentials', file: '/content/fobs.md' },
      { label: 'What to Wear',       file: '/content/dresscode.md' },
      { label: 'Compensation',       file: '/content/compensation.md' },
    ]),
  ]).then(() => {
    if (window.__editorApplySaved) window.__editorApplySaved();
  });

  initScrollSpy();
  initMobileMenu();
  initSmoothScroll();
});
