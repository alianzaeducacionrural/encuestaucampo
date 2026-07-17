// ================================================
// UNIVERSIDAD EN EL CAMPO — Panel Administrador
//
// Requiere que el GAS tenga el endpoint:
//   GET {GAS_URL}?accion=respuestas
//   → { ok: true, data: [ { ...campos del formulario, timestamp: "..." } ] }
// ================================================

// Paleta de colores coherente con el formulario
const PALETA = {
  verde:   '#059669',
  verdeD:  '#047857',
  verdeC:  '#34d399',
  verde2:  '#a7f3d0',
  naranja: '#f97316',
  azul:    '#3b82f6',
  morado:  '#8b5cf6',
  rojo:    '#ef4444',
  gris:    '#94a3b8',
};

const PIE_COLORS = [PALETA.verde, PALETA.verdeC, PALETA.naranja, PALETA.azul, PALETA.morado, PALETA.rojo, PALETA.gris];

// Estado global
let respuestas     = [];    // datos crudos del GAS
let datosFiltrados = [];    // después de filtros globales
let filtradas      = [];    // después de filtros globales + búsqueda + orden
let ordenCol       = 'fecha_diligenciamiento';
let ordenAsc       = false;
let instGraficos   = {};   // instancias Chart.js
let catalogos      = null; // catálogos del GAS para filtros en cascada

document.addEventListener('DOMContentLoaded', cargarDatos);

// ================================================
// CARGA DE DATOS
// ================================================
async function cargarDatos() {
  setNotif('cargando', '⏳', 'Cargando respuestas desde el servidor…');

  try {
    const url = `${CONFIG.GAS_URL}?accion=respuestas`;
    const res  = await fetch(url);
    const json = await res.json();

    if (!json.ok) throw new Error(json.error || 'Error del servidor');

    respuestas = json.data || [];

    // Cargar catálogos para filtros globales en cascada
    try {
      const catRes  = await fetch(`${CONFIG.GAS_URL}?accion=catalogos`);
      const catJson = await catRes.json();
      if (catJson.ok) catalogos = catJson.data;
    } catch (_) {}

    if (respuestas.length === 0) {
      setNotif('warn', '📭', 'No hay respuestas registradas todavía.');
    } else {
      setNotif('info', '✅', `${respuestas.length} respuesta(s) cargadas correctamente.`);
      setTimeout(() => ocultarNotif(), 3000);
    }

    poblarFiltrosGlobales();
    aplicarFiltrosGlobales();

  } catch (err) {
    // Si el endpoint aún no existe en GAS, mostrar aviso útil
    setNotif('error', '⚠️',
      'No se pudo cargar el listado de respuestas. ' +
      'Verifica que el GAS tenga el endpoint ?accion=respuestas implementado. ' +
      'Detalle: ' + err.message
    );
    document.getElementById('tablaBody').innerHTML =
      '<tr><td colspan="11" class="tabla-vacia">Sin datos disponibles.</td></tr>';
  }
}

// ================================================
// FILTROS GLOBALES
// ================================================
function poblarFiltrosGlobales() {
  const bar   = document.getElementById('filtrosGlobales');
  const selMun  = document.getElementById('globalMunicipio');
  const selInst = document.getElementById('globalInstitucion');
  const selUni  = document.getElementById('globalUniversidad');

  if (catalogos) {
    // Poblar municipios desde catálogos
    selMun.innerHTML = '<option value="">Todos los municipios</option>';
    Object.keys(catalogos.geo).sort().forEach(m => selMun.add(new Option(m, m)));
    selMun.disabled = false;

    // Institución empieza vacía (se llena al elegir municipio)
    selInst.innerHTML = '<option value="">Todas las instituciones</option>';
    selInst.disabled = true;

    // Poblar universidades desde catálogos
    selUni.innerHTML = '<option value="">Todas las universidades</option>';
    Object.keys(catalogos.programas).sort().forEach(u => selUni.add(new Option(u, u)));
    selUni.disabled = false;

    bar.style.display = 'flex';
  } else {
    // Fallback: poblar desde respuestas
    const munis = [...new Set(respuestas.map(r => r.municipio).filter(Boolean))].sort();
    const insts = [...new Set(respuestas.map(r => r.institucion).filter(Boolean))].sort();
    const unis  = [...new Set(respuestas.map(r => r.universidad).filter(Boolean))].sort();

    selMun.innerHTML = '<option value="">Todos los municipios</option>';
    munis.forEach(m => selMun.add(new Option(m, m)));
    selMun.disabled = munis.length === 0;

    selInst.innerHTML = '<option value="">Todas las instituciones</option>';
    insts.forEach(i => selInst.add(new Option(i, i)));
    selInst.disabled = insts.length === 0;

    selUni.innerHTML = '<option value="">Todas las universidades</option>';
    unis.forEach(u => selUni.add(new Option(u, u)));
    selUni.disabled = unis.length === 0;

    bar.style.display = munis.length || insts.length || unis.length ? 'flex' : 'none';
  }
}

function onGlobalMunicipioChange() {
  const selInst = document.getElementById('globalInstitucion');
  const mun     = document.getElementById('globalMunicipio').value;

  selInst.innerHTML = '<option value="">Todas las instituciones</option>';
  selInst.disabled = true;

  if (mun) {
    let insts = [];
    if (catalogos && catalogos.geo[mun]) {
      insts = Object.keys(catalogos.geo[mun]).sort();
    } else {
      insts = [...new Set(respuestas.filter(r => r.municipio === mun).map(r => r.institucion).filter(Boolean))].sort();
    }
    insts.forEach(i => selInst.add(new Option(i, i)));
    selInst.disabled = false;
  }

  aplicarFiltrosGlobales();
}

function onGlobalFilterChange() {
  aplicarFiltrosGlobales();
}

function aplicarFiltrosGlobales() {
  const globalMun = document.getElementById('globalMunicipio').value;
  const globalInst = document.getElementById('globalInstitucion').value;
  const globalUni  = document.getElementById('globalUniversidad').value;

  datosFiltrados = respuestas.filter(r => {
    if (globalMun && r.municipio !== globalMun) return false;
    if (globalInst && r.institucion !== globalInst) return false;
    if (globalUni && r.universidad !== globalUni) return false;
    return true;
  });

  document.getElementById('searchInput').value = '';
  filtrarTabla();
  renderStats();
  renderGraficos();
}

// ================================================
// ESTADÍSTICAS
// ================================================
function renderStats() {
  const hoy   = new Date().toISOString().split('T')[0];
  const datos = datosFiltrados;

  // Total
  set('statTotal', datos.length);

  // Hoy
  const hoyCount = datos.filter(r => (r.timestamp || r.fecha_diligenciamiento || '').startsWith(hoy)).length;
  set('statHoy', hoyCount);

  // Universidad más frecuente
  const uniMap = contarCampo(datos, 'universidad');
  const topUni = topKey(uniMap);
  set('statUni', topUni ? uniMap[topUni] : 0);
  set('statUniNombre', topUni || '—');

  // Valoración promedio docentes
  const vals = datos.map(r => Number(r.p18_valoracion_docentes)).filter(n => n > 0);
  const prom = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—';
  set('statDocentes', prom);

  // Motivados
  const motivados = datos.filter(r =>
    r.p6_motivacion === 'Muy motivado' || r.p6_motivacion === 'Motivado'
  ).length;
  const pctMot = datos.length
    ? Math.round((motivados / datos.length) * 100) + '%'
    : '—';
  set('statMotivados', pctMot);

  // Municipios únicos
  const munis = new Set(datos.map(r => r.municipio).filter(Boolean));
  set('statMun', munis.size);
}

// ================================================
// GRÁFICOS
// ================================================
function renderGraficos() {
  const datos = datosFiltrados;

  crearPie('chartMotivacion', datos, 'p6_motivacion', [
    PALETA.verde, PALETA.verdeC, PALETA.naranja, PALETA.rojo,
  ]);

  crearPie('chartContinuar', datos, 'p7_continuar', [
    PALETA.verde, PALETA.rojo, PALETA.naranja,
  ]);

  crearPie('chartDesempeno', datos, 'p11_desempeno', [
    PALETA.verde, PALETA.verdeC, PALETA.naranja, PALETA.rojo,
  ]);

  crearHistogramaDocentes('chartDocentes', datos);

  crearPie('chartEscuelaNueva', datos, 'p19_escuela_nueva', [
    PALETA.verde, PALETA.rojo, PALETA.naranja,
  ]);

  crearPie('chartAcompanamiento', datos, 'p15_acompanamiento', [
    PALETA.naranja, PALETA.verde, PALETA.verdeC,
  ]);

  crearBarHorizontal('chartUniversidad', datos, 'universidad');
  crearBarHorizontal('chartMunicipio', datos, 'municipio');
}

function crearPie(id, datos, campo, colores) {
  const mapa  = contarCampo(datos, campo);
  const etiq  = Object.keys(mapa);
  const vals  = etiq.map(k => mapa[k]);

  if (instGraficos[id]) instGraficos[id].destroy();

  instGraficos[id] = new Chart(document.getElementById(id), {
    type: 'doughnut',
    data: {
      labels: etiq,
      datasets: [{
        data: vals,
        backgroundColor: colores || PIE_COLORS,
        borderWidth: 3,
        borderColor: '#fff',
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { family: 'DM Sans', size: 11 },
            padding: 14,
            boxWidth: 12,
            boxHeight: 12,
          },
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct   = total ? Math.round((ctx.parsed / total) * 100) : 0;
              return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

function crearHistogramaDocentes(id, datos) {
  const conteo = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  datos.forEach(r => {
    const v = String(r.p18_valoracion_docentes);
    if (conteo[v] !== undefined) conteo[v]++;
  });

  const gradColors = ['#ef4444','#f97316','#eab308','#34d399','#059669'];

  if (instGraficos[id]) instGraficos[id].destroy();

  instGraficos[id] = new Chart(document.getElementById(id), {
    type: 'bar',
    data: {
      labels: ['1 — Muy bajo', '2', '3', '4', '5 — Excelente'],
      datasets: [{
        data: Object.values(conteo),
        backgroundColor: gradColors,
        borderRadius: 8,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.parsed.y} respuesta(s)` },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'DM Sans', size: 11 } } },
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, font: { family: 'DM Sans', size: 11 } },
          grid: { color: '#f0f4f8' },
        },
      },
    },
  });
}

function crearBarHorizontal(id, datos, campo) {
  const mapa  = contarCampo(datos, campo);
  // Ordenar de mayor a menor, mostrar top 12
  const entradas = Object.entries(mapa)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  const etiq = entradas.map(e => e[0]);
  const vals = entradas.map(e => e[1]);

  const altura = Math.max(220, etiq.length * 32);
  document.getElementById(id).parentElement.style.height = altura + 'px';

  if (instGraficos[id]) instGraficos[id].destroy();

  instGraficos[id] = new Chart(document.getElementById(id), {
    type: 'bar',
    data: {
      labels: etiq,
      datasets: [{
        data: vals,
        backgroundColor: PALETA.verde,
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.parsed.x} respuesta(s)` },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { stepSize: 1, font: { family: 'DM Sans', size: 11 } },
          grid: { color: '#f0f4f8' },
        },
        y: {
          grid: { display: false },
          ticks: { font: { family: 'DM Sans', size: 11 } },
        },
      },
    },
  });
}

// ================================================
// TABLA
// ================================================
function renderTabla() {
  const tbody   = document.getElementById('tablaBody');
  const countEl = document.getElementById('tablaCount');

  if (filtradas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="tabla-vacia">Sin resultados para la búsqueda.</td></tr>`;
    countEl.textContent = '';
    return;
  }

  const filas = filtradas.map((r, i) => {
    const motBadge = badgeMotivacion(r.p6_motivacion);
    const contBadge = r.p7_continuar === 'Sí'
      ? '<span class="badge badge-verde">Sí</span>'
      : r.p7_continuar === 'No'
        ? '<span class="badge badge-red">No</span>'
        : '<span class="badge badge-orange">Tal vez</span>';
    const despBadge = badgeDesempeno(r.p11_desempeno);
    const val = r.p18_valoracion_docentes
      ? `<span class="badge badge-${Number(r.p18_valoracion_docentes) >= 4 ? 'verde' : Number(r.p18_valoracion_docentes) <= 2 ? 'red' : 'orange'}">${r.p18_valoracion_docentes}/5</span>`
      : '<span class="badge badge-gray">—</span>';

    const idx = datosFiltrados.indexOf(r);

    return `<tr>
      <td>${(r.fecha_diligenciamiento || r.timestamp || '').substring(0, 10)}</td>
      <td><strong>${esc(r.nombre)}</strong></td>
      <td>${esc(r.municipio)}</td>
      <td>${esc(r.universidad)}</td>
      <td title="${esc(r.programa)}">${truncar(r.programa, 28)}</td>
      <td>${esc(r.semestre)}</td>
      <td>${motBadge}</td>
      <td>${contBadge}</td>
      <td>${despBadge}</td>
      <td>${val}</td>
      <td><button class="btn-ver" onclick="verRespuesta(${idx})">👁 Ver</button></td>
    </tr>`;
  }).join('');

  tbody.innerHTML = filas;
  countEl.textContent = `Mostrando ${filtradas.length} de ${datosFiltrados.length} respuesta(s)`;
}

function filtrarTabla() {
  const q = (document.getElementById('searchInput').value || '').toLowerCase().trim();

  filtradas = datosFiltrados.filter(r => {
    if (q && !Object.values(r).some(v => String(v).toLowerCase().includes(q))) return false;
    return true;
  });

  aplicarOrden();
  renderTabla();
}

// ================================================
// MODAL DE RESPUESTA COMPLETA
// ================================================
const CAMPOS_LABELS = {
  fecha_diligenciamiento: 'Fecha',
  nombre: 'Nombre',
  municipio: 'Municipio',
  institucion: 'Institución',
  sede: 'Sede',
  universidad: 'Universidad',
  programa: 'Programa',
  semestre: 'Semestre',
  p6_motivacion: 'Motivación actual',
  p7_continuar: '¿Continuará en el programa?',
  p8_retiro: '¿Ha considerado retiro?',
  p9_razones_retiro: 'Razones de retiro',
  p10_motivaciones: 'Motivaciones',
  p11_desempeno: 'Desempeño académico',
  p12_dificultades: '¿Ha tenido dificultades?',
  p13_dificultades_detalle: 'Detalle de dificultades',
  p13b_apoyo_oportuno: '¿Recibió apoyo oportuno?',
  p14_estrategias: 'Estrategias',
  p15_acompanamiento: '¿Necesita acompañamiento?',
  p16_aspectos_apoyo: 'Aspectos de apoyo',
  p17_quien_acompana: 'Quién acompaña',
  p18_valoracion_docentes: 'Valoración docentes',
  p19_escuela_nueva: 'Estrategias Escuela Nueva',
  p20_modulos: 'Módulos',
  p21_proyectos_vida: 'Proyectos de vida',
  p22_aspectos_positivos: 'Aspectos positivos',
  p23_mejoras: 'Sugerencias de mejora',
  p24_comentarios: 'Comentarios adicionales',
};

const SECCIONES_MODAL = [
  { titulo: 'Información general', campos: ['fecha_diligenciamiento','nombre','municipio','institucion','sede','universidad','programa','semestre'] },
  { titulo: 'Motivación y permanencia', campos: ['p6_motivacion','p7_continuar','p8_retiro','p9_razones_retiro','p10_motivaciones'] },
  { titulo: 'Rendimiento académico', campos: ['p11_desempeno','p12_dificultades','p13_dificultades_detalle','p13b_apoyo_oportuno','p14_estrategias'] },
  { titulo: 'Necesidades de acompañamiento', campos: ['p15_acompanamiento','p16_aspectos_apoyo','p17_quien_acompana'] },
  { titulo: 'Percepción del proceso formativo', campos: ['p18_valoracion_docentes','p19_escuela_nueva','p20_modulos','p21_proyectos_vida','p22_aspectos_positivos','p23_mejoras','p24_comentarios'] },
];

function verRespuesta(idx) {
  const r = datosFiltrados[idx];
  if (!r) return;

  const modal = document.getElementById('modalRespuesta');
  const body  = document.getElementById('modalBody');

  let html = '';
  SECCIONES_MODAL.forEach(sec => {
    html += `<div class="modal-seccion"><h4>${sec.titulo}</h4><dl>`;
    sec.campos.forEach(c => {
      let val = r[c];
      if (val === undefined || val === null || val === '') val = '—';
      if (Array.isArray(val)) val = val.join(', ') || '—';
      html += `<dt>${CAMPOS_LABELS[c] || c}</dt><dd>${esc(String(val))}</dd>`;
    });
    html += `</dl></div>`;
  });

  body.innerHTML = html;
  modal.classList.add('visible');
}

function cerrarModal() {
  document.getElementById('modalRespuesta').classList.remove('visible');
}

function ordenarPor(col) {
  if (ordenCol === col) {
    ordenAsc = !ordenAsc;
  } else {
    ordenCol = col;
    ordenAsc = true;
  }
  aplicarOrden();
  renderTabla();
}

function aplicarOrden() {
  filtradas.sort((a, b) => {
    const va = String(a[ordenCol] || '').toLowerCase();
    const vb = String(b[ordenCol] || '').toLowerCase();
    return ordenAsc ? va.localeCompare(vb) : vb.localeCompare(va);
  });
}

// ================================================
// EXPORTAR CSV
// ================================================
function exportarCSV() {
  if (!datosFiltrados.length) { alert('No hay datos para exportar.'); return; }

  const cabeceras = [
    'fecha_diligenciamiento','nombre','municipio','institucion','sede',
    'universidad','programa','semestre',
    'p6_motivacion','p7_continuar','p8_retiro','p9_razones_retiro',
    'p10_motivaciones','p11_desempeno','p12_dificultades',
    'p13_dificultades_detalle','p13b_apoyo_oportuno','p14_estrategias',
    'p15_acompanamiento','p16_aspectos_apoyo','p17_quien_acompana',
    'p18_valoracion_docentes','p19_escuela_nueva','p20_modulos',
    'p21_proyectos_vida','p22_aspectos_positivos','p23_mejoras','p24_comentarios',
    'timestamp',
  ];

  const lineas = [
    cabeceras.join(','),
    ...datosFiltrados.map(r =>
      cabeceras.map(c => {
        const v = r[c];
        const str = Array.isArray(v) ? v.join(' | ') : String(v ?? '');
        return `"${str.replace(/"/g, '""')}"`;
      }).join(',')
    ),
  ];

  const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `respuestas_UEC_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ================================================
// UTILIDADES
// ================================================
function contarCampo(datos, campo) {
  const mapa = {};
  datos.forEach(r => {
    const v = r[campo] || 'Sin dato';
    mapa[v] = (mapa[v] || 0) + 1;
  });
  return mapa;
}

function topKey(mapa) {
  return Object.keys(mapa).sort((a, b) => mapa[b] - mapa[a])[0] || null;
}

function set(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function truncar(str, n) {
  const s = String(str || '');
  return s.length > n ? s.substring(0, n) + '…' : s;
}

function setNotif(tipo, icono, texto) {
  const el = document.getElementById('notif');
  el.className = `notif ${tipo} visible`;
  document.getElementById('notifIcono').textContent = icono;
  document.getElementById('notifTexto').textContent = texto;
}

function ocultarNotif() {
  document.getElementById('notif').classList.remove('visible');
}

function badgeMotivacion(v) {
  const map = {
    'Muy motivado': 'badge-verde',
    'Motivado':     'badge-verde',
    'Poco motivado':'badge-orange',
    'Desmotivado':  'badge-red',
  };
  return `<span class="badge ${map[v] || 'badge-gray'}">${esc(v) || '—'}</span>`;
}

function badgeDesempeno(v) {
  const map = {
    'Excelente': 'badge-verde',
    'Bueno':     'badge-blue',
    'Regular':   'badge-orange',
    'Bajo':      'badge-red',
  };
  return `<span class="badge ${map[v] || 'badge-gray'}">${esc(v) || '—'}</span>`;
}
