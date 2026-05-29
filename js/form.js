// ================================================
// UNIVERSIDAD EN EL CAMPO — Lógica del formulario
// ================================================

// --- Estado global ---
let seccionActual = 1;
const TOTAL_SECCIONES = 6;
const SECCIONES_NOMBRE = [
  '', // índice 0 vacío
  'Información general',
  'Motivación y permanencia',
  'Rendimiento académico',
  'Necesidades de acompañamiento',
  'Percepción del proceso formativo',
  'Cierre',
];

let catalogos = null; // se llena desde GAS

// ================================================
// INICIALIZACIÓN
// ================================================
document.addEventListener('DOMContentLoaded', () => {
  // Poner fecha de hoy por defecto
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('fecha_diligenciamiento').value = hoy;

  // Cargar catálogos desde GAS
  cargarCatalogos();

  // Listeners condicionales
  document.querySelectorAll('input[name="p8_retiro"]').forEach(r =>
    r.addEventListener('change', () => {
      const bloque = document.getElementById('bloque-p9');
      bloque.classList.toggle('visible', r.value === 'Sí' && r.checked);
    })
  );
  document.querySelectorAll('input[name="p12_dificultades"]').forEach(r =>
    r.addEventListener('change', () => {
      const bloque = document.getElementById('bloque-p13');
      bloque.classList.toggle('visible', r.value === 'Sí' && r.checked);
    })
  );

  // Guardar borrador automáticamente
  document.getElementById('formulario').addEventListener('change', guardarBorrador);
  document.getElementById('formulario').addEventListener('input', guardarBorrador);
});

// ================================================
// CATÁLOGOS DEPENDIENTES
// ================================================
async function cargarCatalogos() {
  const cargando = document.getElementById('cargandoCatalogos');
  const form     = document.getElementById('formulario');

  try {
    const res  = await fetch(`${CONFIG.GAS_URL}?accion=catalogos`);
    const json = await res.json();

    if (!json.ok) throw new Error(json.error);
    catalogos = json.data;

    // Poblar municipios
    const selMun = document.getElementById('municipio');
    Object.keys(catalogos.geo).sort().forEach(mun => {
      selMun.add(new Option(mun, mun));
    });

    // Poblar universidades
    const selUni = document.getElementById('universidad');
    Object.keys(catalogos.programas).sort().forEach(uni => {
      selUni.add(new Option(uni, uni));
    });

    // Restaurar borrador si existe
    restaurarBorrador();

    cargando.classList.remove('visible');
    form.style.display = 'block';

  } catch (err) {
    cargando.innerHTML = `
      <p style="color:#c1121f; font-size:0.9rem">
        No se pudo cargar el formulario.<br>
        Verifica tu conexión e intenta recargar la página.
      </p>
      <button class="btn btn-primario" style="margin-top:16px; max-width:200px" onclick="location.reload()">
        Reintentar
      </button>`;
  }
}

// Municipio → IE
document.getElementById('municipio').addEventListener('change', function () {
  const selIE   = document.getElementById('institucion');
  const selSede = document.getElementById('sede');

  selIE.innerHTML   = '<option value="">— Selecciona una institución —</option>';
  selSede.innerHTML = '<option value="">— Primero selecciona la institución —</option>';
  selIE.disabled    = true;
  selSede.disabled  = true;

  if (!this.value || !catalogos) return;

  const ies = Object.keys(catalogos.geo[this.value] || {}).sort();
  ies.forEach(ie => selIE.add(new Option(ie, ie)));
  selIE.disabled = false;
});

// IE → Sede
document.getElementById('institucion').addEventListener('change', function () {
  const mun     = document.getElementById('municipio').value;
  const selSede = document.getElementById('sede');

  selSede.innerHTML = '<option value="">— Selecciona una sede —</option>';
  selSede.disabled  = true;

  if (!this.value || !catalogos) return;

  const sedes = (catalogos.geo[mun]?.[this.value] || []).sort();
  sedes.forEach(s => selSede.add(new Option(s, s)));
  selSede.disabled = false;
});

// Universidad → Programa
document.getElementById('universidad').addEventListener('change', function () {
  const selProg = document.getElementById('programa');
  selProg.innerHTML = '<option value="">— Selecciona un programa —</option>';
  selProg.disabled  = true;

  if (!this.value || !catalogos) return;

  const progs = (catalogos.programas[this.value] || []).sort();
  progs.forEach(p => selProg.add(new Option(p, p)));
  selProg.disabled = false;
});

// ================================================
// NAVEGACIÓN POR SECCIONES
// ================================================
function siguiente() {
  if (!validarSeccion(seccionActual)) return;
  if (seccionActual < TOTAL_SECCIONES) {
    irA(seccionActual + 1);
  }
}

function anterior() {
  if (seccionActual > 1) irA(seccionActual - 1);
}

function irA(num) {
  const esRetroceso = num < seccionActual;
  document.getElementById(`sec${seccionActual}`).classList.remove('activa');
  seccionActual = num;
  const secEl = document.getElementById(`sec${seccionActual}`);
  secEl.classList.add('activa');
  if (esRetroceso) {
    secEl.classList.add('reverse');
    setTimeout(() => secEl.classList.remove('reverse'), 400);
  }
  actualizarProgreso();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function actualizarProgreso() {
  const pct = (seccionActual / TOTAL_SECCIONES) * 100;
  document.getElementById('progresoFill').style.width    = `${pct}%`;
  document.getElementById('progresoSeccion').textContent = SECCIONES_NOMBRE[seccionActual];
  document.getElementById('progresoContador').textContent = `Sección ${seccionActual} de ${TOTAL_SECCIONES}`;
}

// ================================================
// VALIDACIÓN POR SECCIÓN
// ================================================
const CAMPOS_REQUERIDOS = {
  1: ['nombre', 'municipio', 'institucion', 'sede', 'universidad', 'programa', 'semestre', 'fecha_diligenciamiento'],
  2: ['p6_motivacion', 'p7_continuar', 'p8_retiro'],
  3: ['p11_desempeno', 'p12_dificultades', 'p13b_apoyo_oportuno'],
  4: ['p15_acompanamiento'],
  5: ['p18_valoracion_docentes', 'p19_escuela_nueva', 'p20_modulos', 'p21_proyectos_vida'],
  6: [],
};

function validarSeccion(num) {
  const campos = CAMPOS_REQUERIDOS[num] || [];
  let valido = true;

  campos.forEach(campo => {
    const err = document.getElementById(`err-${campo}`);
    const el  = document.getElementById(campo) ||
                document.querySelector(`input[name="${campo}"]`);

    let vacio = false;

    if (el && (el.tagName === 'SELECT' || el.type === 'text' || el.type === 'date')) {
      vacio = !el.value.trim();
    } else {
      // radio button
      vacio = !document.querySelector(`input[name="${campo}"]:checked`);
    }

    if (err) {
      err.classList.toggle('visible', vacio);
    }
    if (el && el.tagName !== 'INPUT') {
      el.classList.toggle('error', vacio);
    }
    if (vacio) valido = false;
  });

  return valido;
}

// ================================================
// RECOLECTAR DATOS
// ================================================
function recolectarDatos() {
  const get  = id => (document.getElementById(id)?.value || '').trim();
  const radio = name => document.querySelector(`input[name="${name}"]:checked`)?.value || '';
  const checks = name => [...document.querySelectorAll(`input[name="${name}"]:checked`)]
                          .map(c => c.value);

  return {
    nombre:                   get('nombre'),
    municipio:                get('municipio'),
    institucion:              get('institucion'),
    sede:                     get('sede'),
    universidad:              get('universidad'),
    programa:                 get('programa'),
    semestre:                 get('semestre'),
    fecha_diligenciamiento:   get('fecha_diligenciamiento'),
    p6_motivacion:            radio('p6_motivacion'),
    p7_continuar:             radio('p7_continuar'),
    p8_retiro:                radio('p8_retiro'),
    p9_razones_retiro:        checks('p9_razones_retiro'),
    p10_motivaciones:         get('p10_motivaciones'),
    p11_desempeno:            radio('p11_desempeno'),
    p12_dificultades:         radio('p12_dificultades'),
    p13_dificultades_detalle: checks('p13_dificultades_detalle'),
    p13b_apoyo_oportuno:      radio('p13b_apoyo_oportuno'),
    p14_estrategias:          get('p14_estrategias'),
    p15_acompanamiento:       radio('p15_acompanamiento'),
    p16_aspectos_apoyo:       checks('p16_aspectos_apoyo'),
    p17_quien_acompana:       checks('p17_quien_acompana'),
    p18_valoracion_docentes:  radio('p18_valoracion_docentes'),
    p19_escuela_nueva:        radio('p19_escuela_nueva'),
    p20_modulos:              radio('p20_modulos'),
    p21_proyectos_vida:       radio('p21_proyectos_vida'),
    p22_aspectos_positivos:   get('p22_aspectos_positivos'),
    p23_mejoras:              get('p23_mejoras'),
    p24_comentarios:          get('p24_comentarios'),
  };
}

// ================================================
// ENVÍO AL GAS
// ================================================
async function enviarFormulario() {
  if (!validarSeccion(6)) return;

  const datos   = recolectarDatos();
  const form    = document.getElementById('formulario');
  const enviando = document.getElementById('enviando');
  const exito   = document.getElementById('exito');

  form.style.display    = 'none';
  enviando.classList.add('visible');
  document.getElementById('barraProgreso').style.display = 'none';

  try {
    const res = await fetch(CONFIG.GAS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'text/plain' }, // GAS requiere text/plain para evitar CORS preflight
      body:    JSON.stringify(datos),
    });
    const json = await res.json();

    if (!json.ok) throw new Error(json.error);

    localStorage.removeItem('formulario_borrador');
    enviando.classList.remove('visible');
    exito.classList.add('visible');

    // Personalizar mensaje de éxito con el primer nombre
    const primerNombre = datos.nombre.trim().split(' ')[0] || '';
    const nombreEl = document.getElementById('exito-nombre');
    if (nombreEl && primerNombre) nombreEl.textContent = ', ' + primerNombre;

  } catch (err) {
    enviando.classList.remove('visible');
    form.style.display = 'block';
    document.getElementById('barraProgreso').style.display = 'block';
    alert('Ocurrió un error al enviar. Por favor intenta nuevamente.\n\n' + err.message);
  }
}

// ================================================
// BORRADOR EN LOCALSTORAGE
// ================================================
const BORRADOR_KEY = 'formulario_borrador';

function guardarBorrador() {
  try {
    const datos = recolectarDatos();
    localStorage.setItem(BORRADOR_KEY, JSON.stringify(datos));
  } catch (_) {}
}

function restaurarBorrador() {
  try {
    const raw = localStorage.getItem(BORRADOR_KEY);
    if (!raw) return;
    const datos = JSON.parse(raw);

    // Inputs de texto y fecha
    ['nombre','fecha_diligenciamiento','p10_motivaciones','p14_estrategias',
     'p22_aspectos_positivos','p23_mejoras','p24_comentarios'].forEach(id => {
      const el = document.getElementById(id);
      if (el && datos[id]) el.value = datos[id];
    });

    // Selects encadenados — orden importa
    const setSelect = (id, val) => {
      const el = document.getElementById(id);
      if (el && val) {
        el.value = val;
        el.dispatchEvent(new Event('change'));
      }
    };
    setSelect('municipio',    datos.municipio);
    setTimeout(() => {
      setSelect('institucion', datos.institucion);
      setTimeout(() => {
        setSelect('sede',       datos.sede);
      }, 100);
    }, 100);
    setSelect('universidad',  datos.universidad);
    setTimeout(() => setSelect('programa', datos.programa), 100);
    setSelect('semestre',     datos.semestre);

    // Radios
    ['p6_motivacion','p7_continuar','p8_retiro','p11_desempeno','p12_dificultades',
     'p13b_apoyo_oportuno','p15_acompanamiento','p18_valoracion_docentes',
     'p19_escuela_nueva','p20_modulos','p21_proyectos_vida'].forEach(name => {
      if (datos[name]) {
        const r = document.querySelector(`input[name="${name}"][value="${datos[name]}"]`);
        if (r) { r.checked = true; r.dispatchEvent(new Event('change')); }
      }
    });

    // Checkboxes
    ['p9_razones_retiro','p13_dificultades_detalle','p16_aspectos_apoyo','p17_quien_acompana'].forEach(name => {
      (datos[name] || []).forEach(val => {
        const c = document.querySelector(`input[name="${name}"][value="${val}"]`);
        if (c) c.checked = true;
      });
    });

  } catch (_) {}
}

// ================================================
// REINICIAR FORMULARIO
// ================================================
function reiniciarFormulario() {
  document.getElementById('exito').classList.remove('visible');
  document.getElementById('formulario').style.display = 'block';
  document.getElementById('barraProgreso').style.display = 'block';
  document.getElementById('formulario').reset();

  // Resetear selects dependientes
  ['institucion','sede','programa'].forEach(id => {
    const el = document.getElementById(id);
    el.innerHTML = '';
    el.disabled = true;
  });
  document.getElementById('institucion').add(new Option('— Primero selecciona el municipio —', ''));
  document.getElementById('sede').add(new Option('— Primero selecciona la institución —', ''));
  document.getElementById('programa').add(new Option('— Primero selecciona la universidad —', ''));

  // Quitar condicionales
  document.getElementById('bloque-p9').classList.remove('visible');
  document.getElementById('bloque-p13').classList.remove('visible');

  // Volver a sección 1
  document.getElementById(`sec${seccionActual}`).classList.remove('activa');
  seccionActual = 1;
  document.getElementById('sec1').classList.add('activa');
  actualizarProgreso();

  // Poner fecha de hoy
  document.getElementById('fecha_diligenciamiento').value = new Date().toISOString().split('T')[0];

  window.scrollTo({ top: 0, behavior: 'smooth' });
}