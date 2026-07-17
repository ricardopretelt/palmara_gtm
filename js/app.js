/* ==========================================================================
   Palmara — shared site JS.
   dataLayer contract (design/events.md §1.3): one delegated click listener
   reads data-* attributes and pushes them verbatim. No gtag()/GA4 event
   calls here — only Consent Mode updates. GTM reads everything else.
   ========================================================================== */
'use strict';

const CONSENT_KEY = 'palmara_consent';

/* data attribute → dataLayer key mapping, fixed (events.md §1.3) */
const DATA_ATTR_MAP = {
  product: 'product_id',
  line: 'line',
  grade: 'grade',
  collection: 'collection',
  location: 'cta_location',
  docType: 'doc_type',
  colorway: 'colorway',
  filterType: 'filter_type',
  filterValue: 'filter_value',
  direction: 'direction',
  bundle: 'bundle_id',
  form: 'form_id',
  step: 'form_step',
  field: 'form_field',
  consent: 'consent_action'
};

/* Toast-only buttons: event name → toast message ("✓ Request received" style) */
const TOAST_MESSAGES = {
  find_dealer: '✓ Request received — your nearest dealer will reach out shortly.',
  buy_online: '✓ Request received — we’ll connect you with a retail partner.',
  bundle_click: '✓ Request received — Cabana summer bundle details are on the way.',
  download_spec: '✓ Request received — spec sheet on its way.',
  download_manual: '✓ Request received — manual on its way.',
  download_warranty: '✓ Request received — warranty document on its way.',
  calculator_open: '✓ Request received — coverage calculator opening soon.',
  coupon_reveal: '✓ Your promo code: PALMARA-SUN15',
  support_contact: '✓ Request received — customer support will contact you.',
  guides_open: '✓ Request received — user guides & specs on the way.',
  warranty_open: '✓ Request received — warranty information on the way.'
};

window.dataLayer = window.dataLayer || [];

/* ---------- Consent gate --------------------------------------------------
   Nothing beyond consent state itself touches dataLayer before acceptance.
   pending → events queue (flushed only on accept); reject → no data. */

let consentState = localStorage.getItem(CONSENT_KEY) || 'pending';
const pendingPushes = [];

function pushEvent(payload) {
  if (payload.event === 'consent_update') { window.dataLayer.push(payload); return; }
  if (consentState === 'accept') {
    window.dataLayer.push(payload);
  } else if (consentState === 'pending') {
    pendingPushes.push(payload);
  }
  /* reject: drop — no data */
}

function applyConsent(choice) {
  consentState = choice;
  localStorage.setItem(CONSENT_KEY, choice);
  if (choice === 'accept') {
    window.gtag('consent', 'update', { analytics_storage: 'granted' });
    pendingPushes.forEach((p) => window.dataLayer.push(p));
  }
  pendingPushes.length = 0;
  document.documentElement.classList.remove('consent-pending');
}

/* ---------- Catalog data (single source of product truth) ----------------- */

let catalog = [];
const catalogBySlug = new Map();
const catalogReady = fetch('palmara_product_catalog.json')
  .then((r) => r.json())
  .then((data) => {
    catalog = data;
    data.forEach((p) => catalogBySlug.set(p.product_slug, p));
    return data;
  });

const slug = (s) => String(s).toLowerCase().trim().replace(/\s+/g, '-');

function imageSrc(p, colorway) {
  return p.color && p.color.available
    ? `product_images/${p.product_slug}-color-${colorway || 'deep-palm'}.png`
    : `product_images/${p.product_slug}.png`;
}

function firstSentence(text) {
  const i = text.indexOf('.');
  return i > -1 ? text.slice(0, i + 1) : text;
}

/* ---------- Toast ---------------------------------------------------------- */

let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

/* ---------- The one delegated click listener ------------------------------- */

function buildPayload(el) {
  const d = el.dataset;
  const payload = { event: d.event };
  for (const [key, param] of Object.entries(DATA_ATTR_MAP)) {
    if (d[key] !== undefined) payload[param] = d[key];
  }
  if (d.product && catalogBySlug.has(d.product)) {
    payload.product_name = catalogBySlug.get(d.product).product_name;
  }
  return payload;
}

let catalogCtl = null; /* set on the catalog page */

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-event]');
  if (!el) return;
  const name = el.dataset.event;

  /* search_submit is handled on the form's submit event (Enter or icon);
     registration_submit is pushed from the form submit handler so Enter-key
     submits are captured too. */
  if (el.tagName === 'FORM' || name === 'search_submit' || name === 'registration_submit') return;

  if (name === 'consent_update') {
    applyConsent(el.dataset.consent); /* Consent Mode update first, then the event */
    pushEvent(buildPayload(el));
    return;
  }

  if (name === 'filter_select' && el.classList.contains('active')) return;

  pushEvent(buildPayload(el));

  if (TOAST_MESSAGES[name]) {
    e.preventDefault();
    showToast(TOAST_MESSAGES[name]);
    return;
  }
  if (name === 'carousel_nav') carouselNav(el);
  if (name === 'select_colorway') selectColorway(el);
  if ((name === 'filter_select' || name === 'filter_clear') && catalogCtl) catalogCtl.onFilter(name, el);
  /* navigation events (catalog_open, register_open, line_select,
     select_product) proceed with the default link behavior */
});

/* ---------- Search (header form, every page) ------------------------------- */

function initSearchForms() {
  document.querySelectorAll('form[data-event="search_submit"]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const term = form.elements.q.value.toLowerCase().trim();
      if (!term) return;
      pushEvent({ event: 'search_submit', search_term: term });
      if (catalogCtl) {
        catalogCtl.applySearch(term);
      } else {
        window.location.href = 'catalog.html?search=' + encodeURIComponent(term);
      }
    });
  });
}

/* ---------- Shared product card ------------------------------------------- */

function productCard(p, location) {
  const a = document.createElement('a');
  a.className = 'product-card';
  a.href = 'product.html?id=' + encodeURIComponent(p.product_slug);
  a.dataset.event = 'select_product';
  a.dataset.product = p.product_slug;
  a.dataset.line = slug(p.line);
  a.dataset.grade = slug(p.grade);
  if (p.collection) a.dataset.collection = slug(p.collection);
  a.dataset.location = location;
  a.innerHTML = `
    <div class="card-media"><img src="${imageSrc(p)}" alt="${p.product_name} on white background" loading="lazy"></div>
    <div class="card-body">
      <div class="card-badges">
        <span class="badge badge-line">${p.line}</span>
        <span class="badge badge-grade">${p.grade}</span>
        ${p.collection ? `<span class="badge badge-collection">${p.collection}</span>` : ''}
      </div>
      <h3>${p.product_name}</h3>
      <p class="card-benefit">${firstSentence(p.description)}</p>
      <span class="check-details">Check details</span>
    </div>`;
  return a;
}

/* ---------- Home ----------------------------------------------------------- */

function carouselNav(el) {
  const track = document.getElementById('carousel-track');
  if (!track) return;
  const dir = el.dataset.direction === 'next' ? 1 : -1;
  const card = track.querySelector('.product-card');
  const step = card ? card.getBoundingClientRect().width + 24 : 320;
  track.scrollBy({ left: dir * step, behavior: 'smooth' });
}

async function initHome() {
  await catalogReady;
  const track = document.getElementById('carousel-track');
  catalog
    .filter((p) => slug(p.line) === 'shade')
    .forEach((p) => track.appendChild(productCard(p, 'home_carousel')));
}

/* ---------- Catalog -------------------------------------------------------- */

async function initCatalog() {
  await catalogReady;
  const grid = document.getElementById('catalog-grid');
  const emptyState = document.getElementById('catalog-empty');
  const params = new URLSearchParams(window.location.search);
  const state = {
    search: (params.get('search') || '').toLowerCase().trim(),
    line: params.get('line') || '',
    grade: params.get('grade') || '',
    color: params.get('color') || '',
    collection: params.get('collection') || ''
  };

  /* Collection filter options come from the catalog JSON (currently Cabana) */
  const collectionChips = document.getElementById('collection-chips');
  [...new Set(catalog.map((p) => p.collection).filter(Boolean))].forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.event = 'filter_select';
    b.dataset.filterType = 'collection';
    b.dataset.filterValue = slug(c);
    b.textContent = c;
    collectionChips.appendChild(b);
  });

  function matches(p) {
    if (state.line && slug(p.line) !== state.line) return false;
    if (state.grade && slug(p.grade) !== state.grade) return false;
    if (state.collection && slug(p.collection || '') !== state.collection) return false;
    if (state.color && !(p.color.available && p.color.colors.some((c) => slug(c) === state.color))) return false;
    if (state.search) {
      const hay = `${p.product_name} ${p.line} ${p.description}`.toLowerCase();
      if (!hay.includes(state.search)) return false;
    }
    return true;
  }

  function syncChips() {
    document.querySelectorAll('.filters .chip[data-filter-type]').forEach((chip) => {
      chip.classList.toggle('active', state[chip.dataset.filterType] === chip.dataset.filterValue);
    });
  }

  function syncURL() {
    const q = new URLSearchParams();
    Object.entries(state).forEach(([k, v]) => { if (v) q.set(k, v); });
    const qs = q.toString();
    history.replaceState(null, '', 'catalog.html' + (qs ? '?' + qs : ''));
  }

  function render({ afterSearch = false } = {}) {
    const results = catalog.filter(matches);
    grid.innerHTML = '';
    const location = state.search ? 'search_results' : 'catalog_card';
    results.forEach((p) => grid.appendChild(productCard(p, location)));
    emptyState.hidden = results.length !== 0;
    syncChips();
    syncURL();
    if (afterSearch) {
      pushEvent({ event: 'view_search_results', search_term: state.search, results_count: results.length });
    }
  }

  catalogCtl = {
    onFilter(name, el) {
      if (name === 'filter_clear') {
        state.line = state.grade = state.color = state.collection = state.search = '';
        document.querySelectorAll('form[data-event="search_submit"] input').forEach((i) => { i.value = ''; });
      } else {
        state[el.dataset.filterType] = el.dataset.filterValue;
      }
      render();
    },
    applySearch(term) {
      state.search = term;
      render({ afterSearch: true });
    }
  };

  if (state.search) {
    document.querySelectorAll('form[data-event="search_submit"] input').forEach((i) => { i.value = state.search; });
  }
  /* view_search_results fires whenever results render after a search —
     including landing here from another page's search bar */
  render({ afterSearch: !!state.search });
}

/* ---------- Product detail ------------------------------------------------- */

function selectColorway(el) {
  const img = document.getElementById('product-image');
  const p = catalogBySlug.get(el.dataset.product);
  if (!img || !p) return;
  img.src = imageSrc(p, el.dataset.colorway);
  el.closest('.swatches').querySelectorAll('.swatch').forEach((s) => {
    s.classList.toggle('active', s === el);
  });
}

async function initProduct() {
  await catalogReady;
  const id = new URLSearchParams(window.location.search).get('id');
  const p = catalogBySlug.get(id);
  const root = document.getElementById('product-root');
  if (!p) {
    document.getElementById('product-missing').hidden = false;
    return;
  }

  document.title = `${p.product_name} — Palmara`;
  document.getElementById('product-band').textContent = `${p.line} line`;

  const lineSlug = slug(p.line);
  const gradeSlug = slug(p.grade);
  const productAttrs =
    `data-product="${p.product_slug}" data-line="${lineSlug}" data-grade="${gradeSlug}"`;
  const isCabana = slug(p.collection || '') === 'cabana';

  const downloadIcon =
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';

  root.innerHTML = `
    <div class="product-main">
      <div class="product-figure">
        <img id="product-image" src="${imageSrc(p)}" alt="${p.product_name} on white background">
        ${p.color.available ? `
        <div class="swatches" role="group" aria-label="Colorway">
          ${p.color.colors.map((c, i) => `
          <button type="button" class="swatch ${i === 0 ? 'active' : ''}"
                  data-event="select_colorway" data-colorway="${slug(c)}" ${productAttrs}>
            <span class="swatch-dot ${slug(c)}"></span>${c}
          </button>`).join('')}
        </div>` : ''}
      </div>
      <div class="product-info">
        <div class="card-badges">
          <span class="badge badge-line">${p.line}</span>
          <span class="badge badge-grade">${p.grade} grade</span>
          ${p.collection ? `<span class="badge badge-collection">${p.collection} collection</span>` : ''}
        </div>
        <h1>${p.product_name}</h1>
        <p class="product-desc">${p.description}</p>
        <div class="product-ctas">
          <button type="button" class="btn btn-primary"
                  data-event="find_dealer" data-location="product_detail" ${productAttrs}>Find a Dealer</button>
          ${p.Retail ? `
          <button type="button" class="btn btn-primary"
                  data-event="buy_online" data-location="product_detail" ${productAttrs}>Buy Online</button>` : ''}
          <a class="btn btn-secondary" href="register.html?product=${encodeURIComponent(p.product_slug)}"
             data-event="register_open" data-location="product_detail" ${productAttrs}>Register this product</a>
        </div>
        <div class="product-blocks">
          <div class="product-block">
            <h2>Downloads</h2>
            <div class="block-actions">
              ${p.specs ? `
              <button type="button" class="btn btn-secondary" data-event="download_spec"
                      data-doc-type="spec" data-location="product_detail" ${productAttrs}>${downloadIcon}Spec sheet</button>` : ''}
              ${p.manual ? `
              <button type="button" class="btn btn-secondary" data-event="download_manual"
                      data-doc-type="manual" data-location="product_detail" ${productAttrs}>${downloadIcon}Manual</button>` : ''}
              ${p.warranty ? `
              <button type="button" class="btn btn-secondary" data-event="download_warranty"
                      data-doc-type="warranty" data-location="product_detail" ${productAttrs}>${downloadIcon}Warranty doc</button>` : ''}
            </div>
          </div>
          ${p.calculator || p.coupon || isCabana ? `
          <div class="product-block">
            <h2>More for this product</h2>
            <div class="block-actions">
              ${p.calculator ? `
              <button type="button" class="btn btn-secondary" data-event="calculator_open"
                      data-location="product_detail" ${productAttrs}>Coverage calculator</button>` : ''}
              ${p.coupon ? `
              <button type="button" class="btn btn-secondary" data-event="coupon_reveal"
                      data-location="product_detail" ${productAttrs}>Get promo code</button>` : ''}
              ${isCabana ? `
              <button type="button" class="btn btn-secondary" data-event="bundle_click"
                      data-bundle="cabana-summer" data-location="product_detail" ${productAttrs}>Summer bundle</button>` : ''}
            </div>
          </div>` : ''}
        </div>
      </div>
    </div>`;

  const viewItem = {
    event: 'view_item',
    product_id: p.product_slug,
    product_name: p.product_name,
    line: lineSlug,
    grade: gradeSlug
  };
  if (p.collection) viewItem.collection = slug(p.collection);
  if (p.color.available) viewItem.colorway = slug(p.color.colors[0]);
  pushEvent(viewItem);
}

/* ---------- Product registration (staged funnel) --------------------------- */

function initRegister() {
  const form = document.getElementById('registration-form');
  const formId = form.dataset.form;

  catalogReady.then(() => {
    const sel = form.elements.product;
    catalog.forEach((p) => sel.add(new Option(p.product_name, p.product_slug)));
    const pre = new URLSearchParams(window.location.search).get('product');
    if (pre && catalogBySlug.has(pre)) sel.value = pre;
  });

  form.elements.purchase_date.max = new Date().toISOString().slice(0, 10);

  const steps = [
    { id: '1-contact', fields: ['first_name', 'last_name', 'email'] },
    { id: '2-product', fields: ['product', 'purchase_date'] }
  ];
  let started = false;
  const firedSteps = [];

  function fieldError(field) {
    const el = form.elements[field];
    const v = el.value.trim();
    if (!v) return 'required';
    if (field === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'invalid_format';
    if (field === 'purchase_date' && new Date(v) > new Date()) return 'invalid_format';
    return null;
  }

  function showError(field, type) {
    const box = form.querySelector(`[data-error-for="${field}"]`);
    if (box) box.textContent = type === 'required' ? 'This field is required.' : 'Please check the format.';
  }

  function clearError(field) {
    const box = form.querySelector(`[data-error-for="${field}"]`);
    if (box) box.textContent = '';
  }

  function reportError(field, type) {
    pushEvent({ event: 'registration_error', form_id: formId, form_field: field, error_type: type });
    showError(field, type);
  }

  /* start: first focus/input on any field, once per page load */
  form.addEventListener('focusin', () => {
    if (started) return;
    started = true;
    pushEvent({ event: 'registration_start', form_id: formId });
  });

  /* progress: fires once per step, in step order, when the step first
     becomes complete — never re-fires on later edits */
  function checkProgress() {
    for (const step of steps) {
      if (firedSteps.includes(step.id)) continue;
      if (!step.fields.every((f) => !fieldError(f))) return; /* stop at first incomplete step */
      firedSteps.push(step.id);
      pushEvent({ event: 'registration_progress', form_id: formId, form_step: step.id });
    }
  }
  form.addEventListener('input', (e) => {
    if (e.target.name) clearError(e.target.name);
    checkProgress();
  });
  form.addEventListener('change', checkProgress);

  /* error: inline validation failure on blur */
  form.addEventListener('focusout', (e) => {
    const field = e.target.name;
    if (!field) return;
    const err = fieldError(field);
    if (err) reportError(field, err);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    /* submit fires before the validation outcome (Enter key included) */
    pushEvent(buildPayload(form.querySelector('[data-event="registration_submit"]')));

    let firstInvalid = null;
    steps.forEach((step) => step.fields.forEach((f) => {
      const err = fieldError(f);
      if (err) {
        reportError(f, err);
        firstInvalid = firstInvalid || form.elements[f];
      }
    }));
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    const p = catalogBySlug.get(form.elements.product.value);
    form.hidden = true;
    const success = document.getElementById('registration-success');
    success.hidden = false;
    pushEvent({
      event: 'registration_success',
      form_id: formId,
      product_id: p.product_slug,
      line: slug(p.line)
    });
    setTimeout(() => { window.location.href = 'index.html'; }, 4000);
  });
}

/* ---------- Boot ------------------------------------------------------------ */

document.addEventListener('DOMContentLoaded', () => {
  initSearchForms();
  const page = document.body.dataset.page;
  if (page === 'home') initHome();
  if (page === 'catalog') initCatalog();
  if (page === 'product') initProduct();
  if (page === 'register') initRegister();
});
