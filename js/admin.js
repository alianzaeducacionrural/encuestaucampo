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
let respuestas  = [];    // datos crudos del GAS
let filtradas   = [];    // después de búsqueda
let ordenCol    = 'fecha_diligenciamiento';
let ordenAsc    = false;
let instGraficos = {};   // instancias Chart.js

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
    filtradas  = [...respuestas];

    if (respuestas.length === 0) {
      setNotif('warn', '📭', 'No hay respuestas registradas todavía.');
    } else {
      setNotif('info', '✅', `${respuestas.length} respuesta(s) cargadas correctamente.`);
      setTimeout(() => ocultarNotif(), 3000);
    }

    renderStats();
    renderGraficos();
    renderTabla();

  } catch (err) {
    // Si el endpoint aún no existe en GAS, mostrar aviso útil
    setNotif('error', '⚠️',
      'No se pudo cargar el listado de respuestas. ' +
      'Verifica que el GAS tenga el endpoint ?accion=respuestas implementado. ' +
      'Detalle: ' + err.message
    );
    document.getElementById('tablaBody').innerHTML =
      '<tr><td colspan="10" class="tabla-vacia">Sin datos disponibles.</td></tr>';
  }
}

// ================================================
// ESTADÍSTICAS
// ================================================
function renderStats() {
  const hoy = new Date().toISOString().split('T')[0];

  // Total
  set('statTotal', respuestas.length);

  // Hoy
  const hoyCount = respuestas.filter(r => (r.timestamp || r.fecha_diligenciamiento || '').startsWith(hoy)).length;
  set('statHoy', hoyCount);

  // Universidad más frecuente
  const uniMap = contarCampo(respuestas, 'universidad');
  const topUni = topKey(uniMap);
  set('statUni', topUni ? uniMap[topUni] : 0);
  set('statUniNombre', topUni || '—');

  // Valoración promedio docentes
  const vals = respuestas.map(r => Number(r.p18_valoracion_docentes)).filter(n => n > 0);
  const prom = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—';
  set('statDocentes', prom);

  // Motivados
  const motivados = respuestas.filter(r =>
    r.p6_motivacion === 'Muy motivado' || r.p6_motivacion === 'Motivado'
  ).length;
  const pctMot = respuestas.length
    ? Math.round((motivados / respuestas.length) * 100) + '%'
    : '—';
  set('statMotivados', pctMot);

  // Municipios únicos
  const munis = new Set(respuestas.map(r => r.municipio).filter(Boolean));
  set('statMun', munis.size);
}

// ================================================
// GRÁFICOS
// ================================================
function renderGraficos() {
  crearPie('chartMotivacion', respuestas, 'p6_motivacion', [
    PALETA.verde, PALETA.verdeC, PALETA.naranja, PALETA.rojo,
  ]);

  crearPie('chartContinuar', respuestas, 'p7_continuar', [
    PALETA.verde, PALETA.rojo, PALETA.naranja,
  ]);

  crearPie('chartDesempeno', respuestas, 'p11_desempeno', [
    PALETA.verde, PALETA.verdeC, PALETA.naranja, PALETA.rojo,
  ]);

  // Valoración docentes — histograma 1-5
  crearHistogramaDocentes('chartDocentes', respuestas);

  crearPie('chartEscuelaNueva', respuestas, 'p19_escuela_nueva', [
    PALETA.verde, PALETA.rojo, PALETA.naranja,
  ]);

  crearPie('chartAcompanamiento', respuestas, 'p15_acompanamiento', [
    PALETA.naranja, PALETA.verde, PALETA.verdeC,
  ]);

  crearBarHorizontal('chartUniversidad', respuestas, 'universidad');
  crearBarHorizontal('chartMunicipio', respuestas, 'municipio');
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
    tbody.innerHTML = `<tr><td colspan="10" class="tabla-vacia">Sin resultados para la búsqueda.</td></tr>`;
    countEl.textContent = '';
    return;
  }

  const filas = filtradas.map(r => {
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
    </tr>`;
  }).join('');

  tbody.innerHTML = filas;
  countEl.textContent = `Mostrando ${filtradas.length} de ${respuestas.length} respuesta(s)`;
}

function filtrarTabla() {
  const q = (document.getElementById('searchInput').value || '').toLowerCase().trim();
  if (!q) {
    filtradas = [...respuestas];
  } else {
    filtradas = respuestas.filter(r =>
      Object.values(r).some(v => String(v).toLowerCase().includes(q))
    );
  }
  // Reaplicar orden actual
  aplicarOrden();
  renderTabla();
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
  if (!respuestas.length) { alert('No hay datos para exportar.'); return; }

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
    ...respuestas.map(r =>
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
