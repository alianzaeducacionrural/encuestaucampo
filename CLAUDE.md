# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the project

This is a static site with no build step. Open [index.html](index.html) directly in a browser, or serve it with any local HTTP server (e.g. `npx serve .` or VS Code Live Server). There are no dependencies to install.

The form will not load without a live internet connection because it fetches catalogues from Google Apps Script on startup.

## Architecture

Single-page survey form for the *La Universidad en el Campo* program, submitted to a Google Apps Script (GAS) backend.

**Files**
- [js/config.js](js/config.js) — contains only `CONFIG.GAS_URL`, the deployed GAS endpoint
- [js/form.js](js/form.js) — all application logic (catalogue loading, navigation, validation, draft, submission)
- [css/styles.css](css/styles.css) — all styles; uses CSS custom properties defined in `:root`
- [index.html](index.html) — markup for all 6 sections; no templating, no framework

**GAS backend contract**
- `GET {GAS_URL}?accion=catalogos` → `{ ok: true, data: { geo: {...}, programas: {...} } }`
  - `geo` is a nested object: `municipio → IE → sede[]`
  - `programas` is a flat object: `universidad → programa[]`
- `POST {GAS_URL}` with `Content-Type: text/plain` (avoids CORS preflight) and a JSON body → `{ ok: true }` or `{ ok: false, error: "..." }`

**Key behaviours in form.js**
- Cascading selects: municipio → institución → sede and universidad → programa. Each fires a `change` event that populates the next level.
- Conditional questions: `bloque-p9` (retiro reasons) shows when `p8_retiro === 'Sí'`; `bloque-p13` (academic difficulty detail) shows when `p12_dificultades === 'Sí'`.
- Draft auto-save: every `change`/`input` event on the form writes to `localStorage['formulario_borrador']`. On load, the draft is restored *after* catalogues arrive (so cascading selects work via dispatched `change` events with `setTimeout` delays).
- `CAMPOS_REQUERIDOS` maps each section number to the field names that must be non-empty before the user can advance.
- Submission uses `Content-Type: text/plain` intentionally — changing it to `application/json` will trigger a CORS preflight that GAS does not handle.
