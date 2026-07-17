# Palmara — GA4 / GTM Analytics Lab

Palmara is a fictional B2B pool side outdoor-living brand. The website is real;
the brand is scaffolding. The actual purpose of the project is **measurement**:
a fully instrumented static site for showcasing and testing Google Analytics 4 + Google
Tag Manager event tracking, funnels, consent mode, and attribution. Every
interactive element exists to produce a clean, well-defined `dataLayer` event.

## Project summary

- **17 products** across four lines — Shade (5), Living (6), Accents (3),
  Ground (3) — plus a cross-line **Cabana** collection (6 products), all
  defined in a single JSON catalog.
- Every button, link, filter, search, form, and toggle carries a
  `data-event` attribute plus context attributes (`data-product`,
  `data-line`, `data-location`, …) defined in the event contract.
- One shared JS click listener reads those attributes and pushes them to the
  `dataLayer`. GTM does the rest — the page contains **no GA4 calls**.
- A cookie banner implements Google Consent Mode: nothing is tracked before
  acceptance, and rejecting means no data, full stop.

## Pages / sections

| Page | File | What it does |
| --- | --- | --- |
| Home | `index.html` | Hero, line tiles, featured-products carousel (Shade line), Cabana summer-bundle promo strip, support strip. |
| Catalog | `catalog.html` | Full product grid with text search and filters (line, grade, color, collection), driven by URL query params. |
| Product detail | `product.html` | One template page that reads `?id=<slug>` and renders from the catalog JSON: images, colorway swatches, CTAs, and per-product buttons (spec / manual / warranty downloads, calculator, promo code, bundle). |
| Product registration | `register.html` | Two-step form (contact → product) with a staged event funnel: start → progress → error → submit → success. |
| Privacy | `privacy.html` | Explains the analytics cookies and how consent works. |

Most CTAs are **toast-only**: buttons like Find a Dealer, Buy Online,
downloads, calculator, and support links show a shared "✓ Request received"
toast and fire their event — no destination page, since the event is the point.

## Measurement capabilities

- **Event taxonomy** (`design/events.md` — the source of truth): ~25 events
  covering navigation and CTAs (`find_dealer`, `buy_online`, `catalog_open`,
  `line_select`, `select_product` → GA4 `select_item`), catalog search and
  filters (`search`, `view_search_results` with `results_count`,
  `filter_select`/`filter_clear`), product detail (`view_item`,
  `download_spec`/`manual`/`warranty`, `select_colorway`, `calculator_open`,
  `coupon_reveal`, `bundle_click`), support links, and the registration
  funnel (`registration_start/progress/error/submit/success`).
- **Per-product button logic** comes from flags in the catalog JSON, never
  hardcoded: calculator only on Ground-line products, promo code only on
  Accents, manual only where `manual: true`, colorway swatches only where
  colors are available, bundle CTA on every Cabana-collection product.
- **Consent gate**: GTM's Consent Mode defaults to denied on every page.
  Events fired before a choice are queued and flushed only on Accept;
  Reject drops them. The choice persists in `localStorage`
  (`palmara_consent`).
- **GTM container design** (documented in `design/events.md`): one Data
  Layer Variable per parameter, one Custom Event trigger per event name, one
  GA4 event tag per event — no click/visibility/DOM-scraping triggers, and
  all GA4 tags require granted analytics consent.

## How it's built

Plain static site — **HTML + CSS + vanilla JS**. No frameworks, no build
step, no npm, no backend. The only external dependencies are Google Fonts
(Poppins, Inter) and the GTM snippet.

```
index.html / catalog.html / product.html / register.html / privacy.html
palmara_product_catalog.json   # single source of product data
css/style.css                  # brand tokens as CSS variables, all styling
js/app.js                      # consent gate, delegated click → dataLayer
                               # pusher, catalog/product/register page logic,
                               # shared toast + product-card components
design/                        # events.md (event contract), design_plan.md
                               # (brand + layout rules), layout mockups
icons/, home_images/, product_images/
```

Key mechanics in `js/app.js`:

- The catalog JSON is fetched once; all product cards and the detail page
  render from it (nothing product-specific lives in the HTML).
- A single delegated `click` listener maps `data-*` attributes to
  `dataLayer` keys via a fixed table and enriches pushes with
  `product_name` looked up from the JSON.
- `document.body.dataset.page` routes to the page initializer
  (`home` / `catalog` / `product` / `register`).
- Catalog filter/search state is mirrored to the URL, so filtered views are
  shareable and the line tiles on home deep-link into a pre-filtered catalog.

All paths are relative, so the site works from a subpath (e.g. GitHub Pages).

## Run it locally

Because the site fetches `palmara_product_catalog.json`, it must be served
over HTTP (opening `index.html` via `file://` will fail). Any static server
works:

```bash
# from the project root
python3 -m http.server 8000
# then open http://localhost:8000
```

To actually see data flow, replace the `GTM-XXXXXXX` placeholder in the two
GTM snippets of **every** HTML page with your own container ID, and build the
container per `design/events.md` §6 (variables, custom-event triggers, GA4
tags with consent checks). Then use GTM Preview / GA4 DebugView, accept the
cookie banner, and click around.

## Deploy

Push to a GitHub repository and enable GitHub Pages (deploy from branch).
No build step is needed; relative paths make it work from the
`https://<user>.github.io/<repo>/` subpath as-is.
