# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the project

This is a static site with no build step. Open [index.html](index.html) (survey) or [admin.html](admin.html) (dashboard) directly in a browser, or serve them with any local HTTP server (e.g. `npx serve .` or VS Code Live Server). There are no dependencies to install; Chart.js is loaded from a CDN in admin.html.

Neither page will load without a live internet connection, since both fetch data from Google Apps Script on startup.

## Architecture

Two static pages sharing one Google Apps Script (GAS) backend and one field-name contract, for the *La Universidad en el Campo* program:
- [index.html](index.html) — the survey respondents fill out (6 sections, no templating, no framework)
- [admin.html](admin.html) — a read-only analytics dashboard (stats, Chart.js charts, filterable/sortable table, CSV export, per-response modal) over all submitted responses

**Files**
- [js/config.js](js/config.js) — contains only `CONFIG.GAS_URL`, the deployed GAS endpoint; shared by both pages
- [js/form.js](js/form.js) — survey logic (catalogue loading, section navigation, validation, draft autosave, submission)
- [js/admin.js](js/admin.js) — dashboard logic (loading responses, global filters, stats, charts, table, CSV export)
- [css/styles.css](css/styles.css) — styles for index.html; uses CSS custom properties defined in `:root` (admin.html's styles are inlined in its own `<style>` block instead)

**GAS backend contract**
- `GET {GAS_URL}?accion=catalogos` → `{ ok: true, data: { geo: {...}, programas: {...} } }`
  - `geo` is a nested object: `municipio → IE → sede[]`
  - `programas` is a flat object: `universidad → programa[]`
  - used by both index.html (to populate cascading selects) and admin.html (to populate the global filter selects with real catalogue values)
- `GET {GAS_URL}?accion=respuestas` → `{ ok: true, data: [ { ...campos del formulario, timestamp: "..." } ] }`, one object per submission, used only by admin.html
- `POST {GAS_URL}` with `Content-Type: text/plain` (avoids CORS preflight) and a JSON body → `{ ok: true }` or `{ ok: false, error: "..." }`, used only by index.html to submit a response

**The field-name contract**
The question field names (`nombre`, `municipio`, `p6_motivacion`, `p18_valoracion_docentes`, etc.) are the shared vocabulary between the two pages and GAS itself. They appear independently in four places that must be kept in sync when a question is added, renamed, or removed:
- `recolectarDatos()` in form.js — builds the submitted object
- `CAMPOS_REQUERIDOS` in form.js — required fields per section
- `CAMPOS_LABELS` / `SECCIONES_MODAL` in admin.js — the per-response detail modal
- the CSV header list (`cabeceras`) in admin.js's `exportarCSV()`

**Key behaviours in form.js**
- Cascading selects: municipio → institución → sede and universidad → programa. Each fires a `change` event that populates the next level.
- Conditional questions: `bloque-p9` (retiro reasons) shows when `p8_retiro === 'Sí'`; `bloque-p13` (academic difficulty detail) shows when `p12_dificultades === 'Sí'`.
- Draft auto-save: every `change`/`input` event on the form writes to `localStorage['formulario_borrador']`. On load, the draft is restored *after* catalogues arrive (so cascading selects work via dispatched `change` events with `setTimeout` delays).
- Submission uses `Content-Type: text/plain` intentionally — changing it to `application/json` will trigger a CORS preflight that GAS does not handle.

**Key behaviours in admin.js**
- Global filters (municipio → institución cascade, plus universidad) narrow `respuestas` into `datosFiltrados`, which drives the stats cards and all charts. A separate search box further narrows `datosFiltrados` into `filtradas`, which drives only the table. Filter options are populated from the `catalogos` GAS response when available (restricted to values actually present in `respuestas`), falling back to deriving options directly from `respuestas` if catalogues fail to load.
- Table rows index back into `datosFiltrados` (not `filtradas`) for the "Ver" modal, so `verRespuesta(idx)` must be called with an index into `datosFiltrados`.
- Chart.js instances are cached in `instGraficos` by canvas id and destroyed/recreated on every `renderGraficos()` call (e.g. after a filter change) to avoid leaking chart instances.
