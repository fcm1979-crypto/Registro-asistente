// ─────────────────────────────────────────────
// sidebar.js — Lógica del panel lateral
// Carga PDF.js, extrae texto, parsea y muestra.
// ─────────────────────────────────────────────

import { parseEscritura } from './parser.js';
import { consultarCatastro, alertaSuperficie } from './catastro.js';
import { generarCalificacion } from './calificacion.js';
import { compararDocumentos } from './comparador.js';
import { generarBorrador } from './notaCalificacion.js';
import { calcularPlazos, calcularPlazosDefecto, getDocumentacionComplementaria, diasRestantes, formatFecha } from './plazos.js';
import { calcularHonorarios } from './arancel.js';
import { abrirFacturaPDF } from './factura.js';
import { parseGML, validarGML, cruzarConParcelario, bboxConsulta, generarInformeGML, dibujarParcelasSVG, escaparHTML, concordanciaSuperficie, extraerLinderos } from './gml.js';
import { validarLista } from './nif.js';
import { DEFECTOS, CATEGORIAS, buscarDefectos } from './defectos.js';

// ══════════════════════════════════════════════
// ROBUSTEZ: LOGGER + FETCH TIMEOUT
// ══════════════════════════════════════════════

const RA_LOG_KEY = 'ra_log';
const RA_LOG_MAX = 150; // entradas máximas en el buffer circular

/**
 * Logger centralizado. Escribe en consola y persiste en localStorage
 * para facilitar el soporte/depuración sin telemetría externa.
 * @param {'info'|'warn'|'error'} nivel
 * @param {string} msg
 * @param {*} [datos]
 */
function raLog(nivel, msg, datos) {
  const ts = new Date().toISOString().slice(11, 19); // HH:MM:SS
  const entrada = { ts, nivel, msg, ...(datos !== undefined ? { datos } : {}) };
  // Consola
  if      (nivel === 'error') console.error(`[RA ${ts}] ${msg}`, datos ?? '');
  else if (nivel === 'warn')  console.warn (`[RA ${ts}] ${msg}`, datos ?? '');
  else                        console.log  (`[RA ${ts}] ${msg}`, datos ?? '');
  // Buffer circular en localStorage (sin envío externo)
  try {
    const logs = JSON.parse(localStorage.getItem(RA_LOG_KEY) || '[]');
    logs.push(entrada);
    if (logs.length > RA_LOG_MAX) logs.splice(0, logs.length - RA_LOG_MAX);
    localStorage.setItem(RA_LOG_KEY, JSON.stringify(logs));
  } catch (_) { /* no bloquear si localStorage está lleno */ }
}

/**
 * Wrapper de fetch con timeout configurable.
 * Lanza AbortError si supera el límite de tiempo.
 * @param {string} url
 * @param {RequestInit} [opts]
 * @param {number} [ms=12000] timeout en milisegundos
 */
function fetchTimeout(url, opts = {}, ms = 12000) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal })
    .finally(() => clearTimeout(timer))
    .catch(err => {
      if (err.name === 'AbortError') {
        raLog('warn', 'fetch timeout', { url, ms });
        throw new Error(`La consulta tardó demasiado (>${ms / 1000}s). Comprueba la conexión.`);
      }
      throw err;
    });
}

// ══════════════════════════════════════════════
// SISTEMA DE LICENCIAS
// ══════════════════════════════════════════════

const LICENCIA_KEY      = 'ra_license_key';
const LICENCIA_VALIDA   = 'ra_license_valid';
const LICENCIA_CHECK_TS = 'ra_license_ts';
const REVALIDAR_CADA_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

// ── Prueba gratuita 30 días ───────────────────
const TRIAL_INSTALL_KEY = 'ra_install_date';
const TRIAL_DAYS        = 30;

function getTrialDaysLeft() {
  let installDate = localStorage.getItem(TRIAL_INSTALL_KEY);
  if (!installDate) {
    installDate = String(Date.now());
    localStorage.setItem(TRIAL_INSTALL_KEY, installDate);
  }
  const elapsed = (Date.now() - parseInt(installDate, 10)) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(TRIAL_DAYS - elapsed));
}

const DEV_MODE = false;

// Genera un ID de instancia único para este navegador
function getInstanceId() {
  let id = localStorage.getItem('ra_instance_id');
  if (!id) {
    id = 'chrome-' + crypto.randomUUID();
    localStorage.setItem('ra_instance_id', id);
  }
  return id;
}

const INSTANCE_ID_KEY = 'ra_instance_id';

async function llamarWorker(licenseKey, action) {
  const instanceId = getInstanceId();
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'VALIDAR_LICENCIA', licenseKey, instanceId, action },
      (resp) => {
        if (chrome.runtime.lastError || !resp) {
          resolve({ valid: false, error: 'Sin conexión' });
        } else {
          resolve(resp);
        }
      }
    );
  });
}

async function validarLicenciaRemota(licenseKey) {
  // Primera vez: activar. Revalidaciones: validar con instance_id guardado.
  const yaActivada = localStorage.getItem(LICENCIA_VALIDA) === '1';
  const action = yaActivada ? 'validate' : 'activate';
  return llamarWorker(licenseKey, action);
}

function comprobarLicencia() {
  const pantallaLic  = document.getElementById('pantallaLicencia');
  const bannerTrial  = document.getElementById('bannerTrial');
  const trialDiasEl  = document.getElementById('trialDias');

  // En modo desarrollo saltamos la pantalla de licencia
  if (DEV_MODE) {
    pantallaLic.style.display = 'none';
    if (bannerTrial) bannerTrial.style.display = 'none';
    return;
  }

  const keyGuardada = localStorage.getItem(LICENCIA_KEY);
  const esValida    = localStorage.getItem(LICENCIA_VALIDA) === '1';

  if (keyGuardada && esValida) {
    // Licencia guardada localmente → acceso inmediato sin llamada de red
    pantallaLic.style.display = 'none';
    if (bannerTrial) bannerTrial.style.display = 'none';

    // Revalidación silenciosa en segundo plano (solo si el SW está despierto)
    const ultimaCheck = parseInt(localStorage.getItem(LICENCIA_CHECK_TS) || '0', 10);
    if (Date.now() - ultimaCheck > REVALIDAR_CADA_MS) {
      setTimeout(() => {
        llamarWorker(keyGuardada, 'validate').then(resp => {
          if (resp && !resp.valid) {
            localStorage.setItem(LICENCIA_VALIDA, '0');
            pantallaLic.style.display = 'flex';
          } else if (resp && resp.valid) {
            localStorage.setItem(LICENCIA_CHECK_TS, String(Date.now()));
          }
        }).catch(err => { raLog('warn', 'Revalidación licencia fallida (sin conexión)', err?.message); });
      }, 3000); // espera 3s para que el SW esté despierto
    }
    return;
  }

  // Sin licencia → comprobar periodo de prueba
  const diasRestantes = getTrialDaysLeft();
  if (diasRestantes > 0) {
    pantallaLic.style.display = 'none';
    if (bannerTrial) {
      bannerTrial.style.display = 'flex';
      if (trialDiasEl) trialDiasEl.textContent = diasRestantes;
      // Urgencia visual cuando quedan ≤7 días
      if (diasRestantes <= 7) {
        bannerTrial.style.background = '#dc2626'; // rojo urgente
        const trialIconEl = document.getElementById('trialIcon');
        if (trialIconEl) trialIconEl.textContent = '⚠️';
      }
    }
  } else {
    // Prueba caducada → mostrar pantalla de activación
    pantallaLic.style.display = 'flex';
    if (bannerTrial) bannerTrial.style.display = 'none';
  }
}

// ── Botón Activar ─────────────────────────────
document.getElementById('btnActivar').addEventListener('click', async function () {
  const clave   = document.getElementById('inputLicencia').value.trim();
  const errorEl = document.getElementById('licError');
  const okEl    = document.getElementById('licOk');
  const btn     = document.getElementById('btnActivar');

  errorEl.textContent = '';
  okEl.textContent    = '';

  if (!clave) {
    errorEl.textContent = 'Introduce tu clave de licencia.';
    return;
  }

  btn.disabled        = true;
  btn.textContent     = 'Verificando…';

  const resp = await validarLicenciaRemota(clave);

  btn.disabled    = false;
  btn.textContent = 'Activar licencia';

  if (resp.valid) {
    localStorage.setItem(LICENCIA_KEY,      clave);
    localStorage.setItem(LICENCIA_VALIDA,   '1');
    localStorage.setItem(LICENCIA_CHECK_TS, String(Date.now()));
    okEl.textContent = '✓ Licencia activada correctamente.';
    setTimeout(() => {
      document.getElementById('pantallaLicencia').style.display = 'none';
    }, 1200);
  } else {
    errorEl.textContent = 'Clave no válida o suscripción inactiva. Compruébala en tu email.';
  }
});

// Arrancamos la comprobación de licencia
comprobarLicencia();

// ── Referencias DOM ───────────────────────────
const uploadZone  = document.getElementById('uploadZone');
const fileInput   = document.getElementById('fileInput');
const estadoEl    = document.getElementById('estado');
const estadoTxt   = document.getElementById('estadoTexto');
const spinner     = document.getElementById('spinner');
const vacioEl     = document.getElementById('vacio');
const resultadoEl = document.getElementById('resultado');

// ── Pestañas ──────────────────────────────────
function cambiarTab(tab) {
  ['analisis','comparador','plazos','gml','factura','herramientas'].forEach(function (t) {
    document.getElementById('panel' + t.charAt(0).toUpperCase() + t.slice(1))
      .classList.toggle('activo', t === tab);
    document.getElementById('tab'   + t.charAt(0).toUpperCase() + t.slice(1))
      .classList.toggle('activa', t === tab);
  });
  if (tab === 'factura') actualizarPanelFactura();
}
document.getElementById('tabAnalisis').addEventListener('click',       function () { cambiarTab('analisis'); });
document.getElementById('tabComparador').addEventListener('click',     function () { cambiarTab('comparador'); });
document.getElementById('tabPlazos').addEventListener('click',         function () { cambiarTab('plazos'); });
document.getElementById('tabGml').addEventListener('click',            function () { cambiarTab('gml'); });
document.getElementById('tabFactura').addEventListener('click',        function () { cambiarTab('factura'); });
document.getElementById('tabHerramientas').addEventListener('click',   function () { cambiarTab('herramientas'); });

// ── Comparador ────────────────────────────────
var docA = null;
var docB = null;

function actualizarBotonComparar() {
  document.getElementById('btnComparar').disabled = !(docA && docB);
}

function marcarZonaCargada(slot, nombre) {
  var el      = document.getElementById('zona' + slot);
  var hint    = document.getElementById('hint' + slot);
  var nombreEl = document.getElementById('nombre' + slot);
  el.classList.add('cargado');
  hint.textContent  = '✓ Cargado';
  nombreEl.textContent = nombre.length > 22 ? nombre.slice(0, 20) + '…' : nombre;
}

async function cargarDocComp(file, slot) {
  var estadoComp   = document.getElementById('estadoComp');
  var estadoCompTxt = document.getElementById('estadoCompTexto');
  estadoComp.className   = 'estado procesando';
  estadoCompTxt.textContent = 'Leyendo ' + file.name + '...';
  try {
    var buffer = await file.arrayBuffer();
    var texto  = await extraerTexto({ data: buffer });
    var parsed = parseEscritura(texto);
    if (slot === 'A') docA = parsed;
    else              docB = parsed;
    marcarZonaCargada(slot, file.name);
    estadoComp.className = 'estado';
  } catch (err) {
    raLog('error', 'Comparador: fallo al cargar documento', { slot, file: file.name, msg: err.message });
    estadoComp.className      = 'estado error';
    estadoCompTxt.textContent = 'Error: ' + err.message;
  }
  actualizarBotonComparar();
}

// Clicks en zonas → abrir selector de fichero
document.getElementById('zonaA').addEventListener('click', function () { document.getElementById('fileA').click(); });
document.getElementById('zonaB').addEventListener('click', function () { document.getElementById('fileB').click(); });

// Input file change
document.getElementById('fileA').addEventListener('change', function (e) {
  var f = e.target.files && e.target.files[0];
  if (f) cargarDocComp(f, 'A');
  e.target.value = '';
});
document.getElementById('fileB').addEventListener('change', function (e) {
  var f = e.target.files && e.target.files[0];
  if (f) cargarDocComp(f, 'B');
  e.target.value = '';
});

// Drag & drop en zonas
['zonaA', 'zonaB'].forEach(function (id) {
  var zona = document.getElementById(id);
  var slot = id === 'zonaA' ? 'A' : 'B';
  zona.addEventListener('dragover',  function (e) { e.preventDefault(); zona.style.borderColor = '#1e3a5f'; });
  zona.addEventListener('dragleave', function ()  { zona.style.borderColor = ''; });
  zona.addEventListener('drop',      function (e) {
    e.preventDefault(); zona.style.borderColor = '';
    var f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && f.type === 'application/pdf') cargarDocComp(f, slot);
  });
});

// Botón comparar
document.getElementById('btnComparar').addEventListener('click', function () {
  if (!docA || !docB) return;
  renderComparacion(compararDocumentos(docA, docB));
});

function renderComparacion(resultado) {
  var resEl = document.getElementById('compResumen');
  resEl.className   = 'comp-resumen ' + resultado.resumen.nivel;
  resEl.textContent = resultado.resumen.texto;

  document.getElementById('compFilas').innerHTML = resultado.filas.map(function (f) {
    var cls = f.estado === 'discrepancia' ? 'discrepancia' : f.estado === 'aviso' ? 'aviso' : '';
    var ind = f.nota
      ? '<div class="comp-indicador' + (f.estado !== 'discrepancia' ? ' aviso' : '') + '">' + f.nota + '</div>'
      : '';
    return '<div class="comp-fila ' + cls + '">' +
      '<span class="comp-campo">' + f.campo + '</span>' +
      '<span class="comp-val' + (f.valA === '—' ? ' vacio' : '') + '">' + f.valA + '</span>' +
      '<span class="comp-val' + (f.valB === '—' ? ' vacio' : '') + '">' + f.valB + '</span>' +
      ind + '</div>';
  }).join('');

  document.getElementById('resultadoComp').style.display = 'block';
}

// ── Inicializar PDF.js ────────────────────────
async function initPDFjs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  return new Promise(function (resolve, reject) {
    var script = document.createElement('script');
    script.src = chrome.runtime.getURL('pdf.min.js');
    script.onload = function () {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        chrome.runtime.getURL('pdf.worker.min.js');
      resolve(window.pdfjsLib);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// ── Extraer texto de ArrayBuffer ──────────────
async function extraerTexto(source) {
  var pdfjs = await initPDFjs();
  var pdf = await pdfjs.getDocument(source).promise;
  var texto = '';
  for (var i = 1; i <= pdf.numPages; i++) {
    var page = await pdf.getPage(i);
    var content = await page.getTextContent();
    texto += content.items.map(function (it) { return it.str; }).join(' ') + '\n';
  }
  return texto;
}

// ── Cargar PDF desde URL (para auto-detección) ─
async function cargarDesdeURL(url) {
  setEstado('procesando', 'Descargando PDF...');
  vacioEl.style.display = 'none';
  resultadoEl.style.display = 'none';
  try {
    var response = await fetchTimeout(url, {}, 15000);
    if (!response.ok) throw new Error('No se pudo descargar el PDF (HTTP ' + response.status + ')');
    var buffer = await response.arrayBuffer();
    var texto = await extraerTexto({ data: buffer });
    await procesarTexto(texto, url.split('/').pop());
  } catch (err) {
    raLog('error', 'cargarDesdeURL falló', { url, msg: err.message });
    setEstado('error', 'Error al cargar el PDF: ' + err.message);
    vacioEl.style.display = 'block';
  }
}

// ── Cargar PDF desde File ─────────────────────
async function cargarDesdeFile(file) {
  setEstado('procesando', 'Leyendo ' + file.name + '...');
  vacioEl.style.display = 'none';
  resultadoEl.style.display = 'none';
  try {
    var buffer = await file.arrayBuffer();
    var texto = await extraerTexto({ data: buffer });
    await procesarTexto(texto, file.name);
  } catch (err) {
    raLog('error', 'cargarDesdeFile falló', { file: file.name, msg: err.message });
    setEstado('error', 'Error al leer el PDF: ' + err.message);
    vacioEl.style.display = 'block';
  }
}

// ── Flujo principal de análisis ───────────────
async function procesarTexto(texto, filename) {
  // Guard: PDF sin texto extraíble (escaneado sin OCR o protegido)
  const textoLimpio = (texto || '').trim();
  if (textoLimpio.length < 80) {
    raLog('warn', 'PDF sin texto suficiente', { chars: textoLimpio.length, file: filename });
    setEstado('error', 'El PDF no contiene texto extraíble. ¿Es un documento escaneado sin OCR?');
    vacioEl.style.display = 'block';
    return;
  }

  setEstado('procesando', 'Analizando escritura...');
  await tick();

  raLog('info', 'Analizando escritura', { file: filename, chars: textoLimpio.length });
  var analisis = parseEscritura(texto);
  if (analisis.error) {
    setEstado('error', analisis.error);
    vacioEl.style.display = 'block';
    return;
  }

  renderAnalisis(analisis);

  var datosCatastro = null;
  var rc = analisis.refCatastral && analisis.refCatastral.value;
  if (rc) {
    setEstado('procesando', 'Consultando Catastro...');
    datosCatastro = await consultarYRenderizarCatastro(rc, analisis.superficie && analisis.superficie.numerico);
  } else {
    setTextoCatastro('<span style="color:#bbb;font-size:11px">No se detectó referencia catastral en el documento.</span>');
  }

  // ── Calificación asistida ─────────────────────
  setEstado('procesando', 'Generando calificación...');
  await tick();
  renderCalificacion(analisis, datosCatastro);

  // ── Notas del registrador (persistencia) ──────
  var claveNotas = 'notas_' + (analisis.refCatastral?.value || 'sin_rc');
  var obsEl = document.getElementById('obsRegistrador');
  obsEl.value = localStorage.getItem(claveNotas) || '';
  obsEl.addEventListener('input', function () {
    localStorage.setItem(claveNotas, obsEl.value);
  });

  var conf = analisis._meta && analisis._meta.confianzaGlobal || '—';
  setEstado('ok', 'Escritura analizada · Confianza: ' + conf);
  resultadoEl.style.display = 'block';
}

// ── Render de campos ──────────────────────────
function renderAnalisis(a) {
  setText('valTipo',    a.tipoOperacion && a.tipoOperacion.value    || '—');
  setText('valFecha',   a.fecha         && a.fecha.value             || '—');
  setText('valNotario', a.notario       && a.notario.value           || '—');

  var tits = a.titulares && a.titulares.value;
  setText('valTitulares', tits ? tits.join(' · ') : '—', !tits);
  setConf('confTitulares', a.titulares && a.titulares.confidence);

  var dnis = a.documentos && a.documentos.value;
  setText('valDNIs', dnis ? dnis.join(' · ') : '—', !dnis);
  setConf('confDNIs', a.documentos && a.documentos.confidence);

  setText('valRC',     a.refCatastral && a.refCatastral.value || '—', !(a.refCatastral && a.refCatastral.value));
  setConf('confRC',    a.refCatastral && a.refCatastral.confidence);
  setText('valSup',    a.superficie   && a.superficie.value   || '—', !(a.superficie && a.superficie.value));
  setConf('confSup',   a.superficie   && a.superficie.confidence);
  setText('valLind',   a.linderos     && a.linderos.value     || '—', !(a.linderos && a.linderos.value));
  setText('valPrecio', a.precio       && a.precio.value       || '—', !(a.precio && a.precio.value));

  var cargas = a.cargas && a.cargas.value;
  setText('valCargas', cargas ? cargas.join(', ') : '—', !cargas);
}

async function consultarYRenderizarCatastro(rc, supEscritura) {
  setTextoCatastro('<span style="color:#888;font-size:11px">Consultando Catastro para <strong>' + rc + '</strong>...</span>');
  var cat = await consultarCatastro(rc);

  // Si el Catastro no devolvió datos pero tenemos el enlace
  if (cat.ok && cat.soloEnlace) {
    var html = '<div class="alerta aviso" style="margin-bottom:8px">⚠️ La API del Catastro no está accesible desde la extensión. Usa el botón para consultar online.</div>';
    html += '<a class="btn-mapa" href="' + cat.urlVisorMapa + '" target="_blank">🗺️ Ver ficha completa en Catastro</a>';
    setTextoCatastro(html);
    return cat; // devolver para calificación
  }

  if (!cat.ok) {
    setTextoCatastro('<div class="alerta aviso">⚠️ ' + cat.error + '</div>');
    return null;
  }

  var html = [
    field('Dirección',        cat.direccion || '—'),
    field('Municipio',        (cat.municipio || '—') + ' (' + (cat.provincia || '—') + ')'),
    field('Sup. Catastro',    cat.superficie ? cat.superficie + ' m²' : '—'),
    field('Uso',              (cat.uso || '—') + ' · ' + (cat.clase || '—')),
    field('Titular catastral', cat.titular || '—'),
  ].join('');

  if (supEscritura && cat.superficie) {
    var alerta = alertaSuperficie(supEscritura, cat.superficie);
    if (alerta) html += '<div class="alerta ' + alerta.nivel + '">' + alerta.mensaje + '</div>';
  }

  if (cat.urlVisorMapa) {
    html += '<a class="btn-mapa" href="' + cat.urlVisorMapa + '" target="_blank">🗺️ Ver en mapa catastral</a>';
  }

  setTextoCatastro(html);
  return cat; // devolver para calificación
}

// ── Calificación asistida ─────────────────────
var _ultimoAnalisis = null;
var _ultimosChecks  = null;

function renderCalificacion(analisis, datosCatastro) {
  var claveConcursal = 'concursal_' + (analisis.refCatastral?.value || 'sin_rc');
  var concursalVerificado = localStorage.getItem(claveConcursal) === '1';

  var resultado = generarCalificacion(analisis, datosCatastro, { concursalVerificado: concursalVerificado });
  _ultimoAnalisis = analisis;
  _ultimosChecks  = resultado.checks;

  // Resumen ejecutivo
  var resumenEl = document.getElementById('resumenCalif');
  resumenEl.className = 'resumen-calif ' + resultado.resumen.nivel;
  resumenEl.textContent = resultado.resumen.texto;
  resumenEl.style.display = 'block';

  // Lista de checks
  var checksEl = document.getElementById('checksZona');
  checksEl.innerHTML = resultado.checks.map(function (c) {
    var icono = c.nivel === 'verde' ? '✅' : c.nivel === 'rojo' ? '❌' : '⚠️';
    var acciones = '';
    if (c.accion === 'concursal') {
      acciones = '<div class="check-acciones">' +
        '<a class="btn-check-mini" href="https://www.publicidadconcursal.es" target="_blank" rel="noopener">🔎 Consultar RPC</a>' +
        '<button class="btn-check-mini" id="btnToggleConcursal">' +
          (concursalVerificado ? '↺ Desmarcar verificación' : '✓ Marcar como verificado') +
        '</button>' +
      '</div>';
    }
    return '<div class="check-item ' + c.nivel + '">' +
      '<span class="check-icono">' + icono + '</span>' +
      '<div class="check-body">' +
        '<div class="check-titulo">' + c.titulo + '</div>' +
        (c.detalle ? '<div class="check-detalle">' + c.detalle + '</div>' : '') +
        acciones +
      '</div>' +
    '</div>';
  }).join('');

  // Toggle de verificación concursal (persistente por finca)
  var btnConc = document.getElementById('btnToggleConcursal');
  if (btnConc) {
    btnConc.addEventListener('click', function () {
      if (concursalVerificado) localStorage.removeItem(claveConcursal);
      else localStorage.setItem(claveConcursal, '1');
      renderCalificacion(analisis, datosCatastro);
    });
  }

  document.getElementById('secCalificacion').style.display = 'block';
  document.getElementById('btnBorrador').style.display = 'flex';

  // Activar pestaña de plazos
  inicializarPlazos(analisis, resultado.checks);
}

// ── Modal borrador nota de calificación ───────
document.getElementById('btnBorrador').addEventListener('click', function () {
  if (!_ultimoAnalisis || !_ultimosChecks) return;
  var obs = document.getElementById('obsRegistrador').value || '';
  var texto = generarBorrador(_ultimoAnalisis, _ultimosChecks, obs);
  document.getElementById('modalTexto').textContent = texto;
  document.getElementById('modalBorrador').classList.add('abierto');
});

document.getElementById('modalClose').addEventListener('click', function () {
  document.getElementById('modalBorrador').classList.remove('abierto');
});

document.getElementById('modalBorrador').addEventListener('click', function (e) {
  if (e.target === this) this.classList.remove('abierto');
});

document.getElementById('btnCopiar').addEventListener('click', function () {
  var texto = document.getElementById('modalTexto').textContent;
  navigator.clipboard.writeText(texto).then(function () {
    var btn = document.getElementById('btnCopiar');
    btn.textContent = '✅ ¡Copiado!';
    btn.classList.add('copiado');
    setTimeout(function () {
      btn.textContent = '📋 Copiar al portapapeles';
      btn.classList.remove('copiado');
    }, 2000);
  });
});

function field(label, valor) {
  return '<div class="campo" style="padding:6px 0"><span class="campo-label">' +
    label + '</span><span class="campo-valor">' + valor + '</span></div>';
}

// ── Helpers UI ────────────────────────────────
function setText(id, valor, vacio) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = valor;
  el.className = 'campo-valor' + (vacio ? ' vacio' : '');
}

function setConf(id, level) {
  var el = document.getElementById(id);
  if (!el || !level) return;
  el.className = 'conf ' + level;
  el.title = { high: 'Confianza alta', medium: 'Confianza media', low: 'Confianza baja' }[level] || '';
}

function setTextoCatastro(html) {
  document.getElementById('catastroZona').innerHTML = html;
}

function setEstado(tipo, msg) {
  estadoEl.className = 'estado ' + tipo;
  estadoTxt.textContent = msg;
  spinner.style.display = tipo === 'procesando' ? 'block' : 'none';
}

function tick() {
  return new Promise(function (r) { setTimeout(r, 30); });
}

// ── Eventos ───────────────────────────────────
fileInput.addEventListener('change', function (e) {
  var file = e.target.files && e.target.files[0];
  if (file) cargarDesdeFile(file);
  fileInput.value = '';
});

uploadZone.addEventListener('click', function () { fileInput.click(); });
uploadZone.addEventListener('dragover', function (e) {
  e.preventDefault();
  uploadZone.style.borderColor = '#1e3a5f';
});
uploadZone.addEventListener('dragleave', function () {
  uploadZone.style.borderColor = '';
});
uploadZone.addEventListener('drop', function (e) {
  e.preventDefault();
  uploadZone.style.borderColor = '';
  var file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file && file.type === 'application/pdf') cargarDesdeFile(file);
});

// ── Pestaña Plazos ────────────────────────────
var _tipoOperacion = null;
var _claveDoc      = null;
var _hayDefectos   = false;

function inicializarPlazos(analisis, checks) {
  _tipoOperacion = analisis.tipoOperacion?.value || null;
  _claveDoc      = 'plazos_' + (analisis.refCatastral?.value || 'sin_rc');
  _hayDefectos   = checks.some(function (c) { return c.nivel === 'rojo' || c.nivel === 'naranja'; });

  document.getElementById('plazosVacio').style.display    = 'none';
  document.getElementById('plazosContenido').style.display = 'block';

  // Restaurar fechas guardadas
  var guardado = JSON.parse(localStorage.getItem(_claveDoc) || '{}');
  if (guardado.fechaPresentacion) {
    document.getElementById('fechaPresentacion').value = guardado.fechaPresentacion;
    renderPlazos(guardado.fechaPresentacion);
  }
  if (guardado.fechaNotificacion) {
    document.getElementById('fechaNotificacion').value = guardado.fechaNotificacion;
  }

  // Mostrar bloque defectos si los hay
  document.getElementById('bloqueDefectos').style.display = _hayDefectos ? 'block' : 'none';

  // Documentación complementaria
  renderDocComplementaria(_tipoOperacion, guardado.docsChecked || {});
}

function renderPlazos(fechaStr) {
  if (!fechaStr) return;
  var plazos = calcularPlazos(fechaStr);
  var lista  = document.getElementById('plazosLista');
  lista.style.display = 'block';
  lista.innerHTML = Object.values(plazos).map(function (p) {
    return renderPlazoItem(p);
  }).join('');
}

function renderPlazosDefecto(fechaStr) {
  if (!fechaStr) return;
  var plazos = calcularPlazosDefecto(fechaStr);
  var lista  = document.getElementById('plazosDefectoLista');
  lista.innerHTML = Object.values(plazos).map(function (p) {
    return renderPlazoItem(p);
  }).join('');
}

function renderPlazoItem(p) {
  var dias = diasRestantes(p.fecha);
  var cls  = dias < 0 ? 'vencido' : dias <= 5 ? 'urgente' : dias <= 15 ? 'proximo' : 'ok';
  var diasTxt = dias < 0 ? Math.abs(dias) : dias;
  var diasLabel = dias < 0 ? 'VENCIDO' : dias === 0 ? 'HOY' : 'días';
  return '<div class="plazo-item ' + cls + '">' +
    '<div class="plazo-contador">' +
      '<div class="plazo-dias">' + (dias === 0 ? '!' : diasTxt) + '</div>' +
      '<div class="plazo-dias-label">' + diasLabel + '</div>' +
    '</div>' +
    '<div class="plazo-info">' +
      '<div class="plazo-nombre">' + p.label + '</div>' +
      '<div class="plazo-fecha">' + formatFecha(p.fecha) + '</div>' +
      '<div class="plazo-base">' + p.base + '</div>' +
    '</div>' +
  '</div>';
}

function renderDocComplementaria(tipo, checkedMap) {
  var docs = getDocumentacionComplementaria(tipo);
  var zona = document.getElementById('docCompZona');
  if (!docs.length) { zona.style.display = 'none'; return; }
  zona.style.display = 'block';

  document.getElementById('docCompItems').innerHTML = docs.map(function (d, i) {
    var id      = 'doc_' + i;
    var checked = checkedMap[id] ? 'checked' : '';
    var cls     = d.obligatorio ? 'obligatorio' : 'opcional';
    var badge   = d.obligatorio
      ? '<span class="doc-comp-badge ob">Obligatorio</span>'
      : '<span class="doc-comp-badge op">Opcional</span>';
    return '<label class="doc-comp-item ' + cls + '">' +
      '<input type="checkbox" id="' + id + '" ' + checked + ' data-idx="' + i + '"> ' +
      '<span style="flex:1">' + d.doc + '</span>' +
      badge +
    '</label>';
  }).join('');

  // Guardar estado de checkboxes
  document.getElementById('docCompItems').addEventListener('change', function (e) {
    if (e.target.type !== 'checkbox') return;
    var guardado = JSON.parse(localStorage.getItem(_claveDoc) || '{}');
    guardado.docsChecked = guardado.docsChecked || {};
    guardado.docsChecked[e.target.id] = e.target.checked;
    localStorage.setItem(_claveDoc, JSON.stringify(guardado));
  });
}

// Eventos fecha presentación
document.getElementById('fechaPresentacion').addEventListener('change', function () {
  var val = this.value;
  renderPlazos(val);
  var guardado = JSON.parse(localStorage.getItem(_claveDoc) || '{}');
  guardado.fechaPresentacion = val;
  localStorage.setItem(_claveDoc, JSON.stringify(guardado));
});

// Eventos fecha notificación defectos
document.getElementById('fechaNotificacion').addEventListener('change', function () {
  var val = this.value;
  renderPlazosDefecto(val);
  var guardado = JSON.parse(localStorage.getItem(_claveDoc) || '{}');
  guardado.fechaNotificacion = val;
  localStorage.setItem(_claveDoc, JSON.stringify(guardado));
});

// ══════════════════════════════════════════════
// MÓDULO DE FACTURA
// ══════════════════════════════════════════════

// Formateador de moneda
function formatEur(n) {
  return (n || 0).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' €';
}

// Claves localStorage para datos del Registro
var FACT_KEYS = {
  nombre:    'ra_reg_nombre',
  nif:       'ra_reg_nif',
  registro:  'ra_reg_registro',
  direccion: 'ra_reg_direccion',
  municipio: 'ra_reg_municipio',
  telefono:  'ra_reg_telefono',
};

// Cargar y guardar datos del Registro automáticamente
(function initDatosRegistro() {
  var campos = {
    factRegNombre:    FACT_KEYS.nombre,
    factRegNif:       FACT_KEYS.nif,
    factRegRegistro:  FACT_KEYS.registro,
    factRegDireccion: FACT_KEYS.direccion,
    factRegMunicipio: FACT_KEYS.municipio,
    factRegTelefono:  FACT_KEYS.telefono,
  };
  Object.keys(campos).forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.value = localStorage.getItem(campos[id]) || '';
    el.addEventListener('input', function () {
      localStorage.setItem(campos[id], el.value);
    });
  });
})();

// Toggle sección datos del Registro
document.getElementById('factRegHeader').addEventListener('click', function () {
  var body  = document.getElementById('factRegBody');
  var flecha = document.getElementById('factRegFlecha');
  var open  = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  flecha.textContent = open ? '▸' : '▾';
});

// Poner fecha de hoy por defecto en la factura
(function () {
  var hoy = new Date().toISOString().split('T')[0];
  document.getElementById('factFecha').value = hoy;
})();

// Recalcular honorarios
function recalcularHonorarios() {
  var valorStr = document.getElementById('factValor').value;
  var valor = parseFloat(valorStr) || 0;
  var tipo  = document.getElementById('factTipo').value;

  if (valor <= 0) {
    document.getElementById('factDesglose').style.display = 'none';
    document.getElementById('btnGenerarFactura').disabled = true;
    return;
  }

  var calc = calcularHonorarios(valor, tipo);

  document.getElementById('factLineas').innerHTML = calc.lineas.map(function (l) {
    return '<tr>' +
      '<td>' + l.concepto + '</td>' +
      '<td>' + (l.base ? formatEur(l.base) : '—') + '</td>' +
      '<td>' + formatEur(l.honor) + '</td>' +
    '</tr>';
  }).join('');

  document.getElementById('factSubtotal').textContent = formatEur(calc.subtotal);
  document.getElementById('factIva').textContent      = formatEur(calc.iva);
  document.getElementById('factTotal').textContent    = formatEur(calc.total);

  document.getElementById('factDesglose').style.display = 'block';
  document.getElementById('btnGenerarFactura').disabled = false;
}

document.getElementById('btnFactRecalc').addEventListener('click', recalcularHonorarios);
document.getElementById('factValor').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') recalcularHonorarios();
});

// Actualizar panel factura al cambiar a esa pestaña
function actualizarPanelFactura() {
  var vacio     = document.getElementById('facturaVacio');
  var contenido = document.getElementById('facturaContenido');

  if (!_ultimoAnalisis) {
    vacio.style.display     = 'block';
    contenido.style.display = 'none';
    return;
  }

  vacio.style.display     = 'none';
  contenido.style.display = 'block';

  // Auto-rellenar datos del cliente
  var tits = _ultimoAnalisis.titulares && _ultimoAnalisis.titulares.value;
  var dnis = _ultimoAnalisis.documentos && _ultimoAnalisis.documentos.value;
  var cliNombreEl = document.getElementById('factCliNombre');
  var cliNifEl    = document.getElementById('factCliNif');

  if (tits && tits.length) {
    cliNombreEl.textContent = tits[0];
    cliNombreEl.className   = 'fact-cli-val';
  } else {
    cliNombreEl.textContent = '—';
    cliNombreEl.className   = 'fact-cli-val vacio';
  }
  if (dnis && dnis.length) {
    cliNifEl.textContent = dnis[0];
    cliNifEl.className   = 'fact-cli-val';
  } else {
    cliNifEl.textContent = '—';
    cliNifEl.className   = 'fact-cli-val vacio';
  }

  // Auto-rellenar tipo de operación
  var tipoAnalisis = _ultimoAnalisis.tipoOperacion && _ultimoAnalisis.tipoOperacion.value;
  if (tipoAnalisis) {
    var sel  = document.getElementById('factTipo');
    var tipoL = tipoAnalisis.toLowerCase();
    for (var i = 0; i < sel.options.length; i++) {
      if (tipoL.includes(sel.options[i].value) || sel.options[i].value.includes(tipoL)) {
        sel.selectedIndex = i;
        break;
      }
    }
  }

  // Auto-rellenar valor desde el precio extraído
  var precioVal = _ultimoAnalisis.precio && _ultimoAnalisis.precio.value;
  if (precioVal) {
    var nums = precioVal.replace(/\./g, '').replace(',', '.').match(/[\d]+(?:\.\d+)?/);
    if (nums) {
      var n = parseFloat(nums[0]);
      if (!isNaN(n) && n > 0) {
        document.getElementById('factValor').value = n;
        recalcularHonorarios();
      }
    }
  }
}

// Botón generar factura PDF
document.getElementById('btnGenerarFactura').addEventListener('click', function () {
  var reg = {
    nombre:        localStorage.getItem(FACT_KEYS.nombre)    || '',
    nif:           localStorage.getItem(FACT_KEYS.nif)       || '',
    nombreRegistro: localStorage.getItem(FACT_KEYS.registro) || '',
    direccion:     localStorage.getItem(FACT_KEYS.direccion) || '',
    municipio:     localStorage.getItem(FACT_KEYS.municipio) || '',
  };

  var tits = _ultimoAnalisis && _ultimoAnalisis.titulares && _ultimoAnalisis.titulares.value;
  var dnis = _ultimoAnalisis && _ultimoAnalisis.documentos && _ultimoAnalisis.documentos.value;

  var cli = {
    nombre: (tits && tits[0]) || '',
    nif:    (dnis && dnis[0]) || '',
  };

  var valor    = parseFloat(document.getElementById('factValor').value)  || 0;
  var tipo     = document.getElementById('factTipo').value;
  var numFact  = document.getElementById('factNumero').value || '—';
  var fecha    = document.getElementById('factFecha').value  || '';

  abrirFacturaPDF({ registrador: reg, cliente: cli, valor, tipo, numeroFactura: numFact, fecha });
});

// ── Escuchar URL detectada por el content script
chrome.runtime.onMessage.addListener(function (message) {
  if (message.type === 'PDF_URL_READY' && message.pdfUrl) {
    cargarDesdeURL(message.pdfUrl);
  }
});

// Al abrir la sidebar, preguntar si hay PDF activo
chrome.runtime.sendMessage({ type: 'REQUEST_ACTIVE_PDF' }, function (response) {
  if (response && response.pdfUrl) {
    cargarDesdeURL(response.pdfUrl);
  }
});

// ═══════════════════════════════════════════════════════════════
// PANEL GML — Validación de georreferenciación (v0.3.0)
// ═══════════════════════════════════════════════════════════════

var _gmlParseado  = null;  // resultado de parseGML
var _gmlNombre    = null;  // nombre del fichero cargado
var _gmlChecks    = [];    // checks de validación local
var _gmlChecksCat = [];    // checks del cruce catastral
var _gmlVecinas   = [];    // parcelas vecinas parseadas (para el croquis)

var gmlZone        = document.getElementById('gmlZone');
var gmlInput       = document.getElementById('gmlInput');
var gmlEstado      = document.getElementById('gmlEstado');
var gmlEstadoTexto = document.getElementById('gmlEstadoTexto');
var gmlResultado   = document.getElementById('gmlResultado');
var btnGmlCatastro = document.getElementById('btnGmlCatastro');

function setGmlEstado(clase, texto) {
  gmlEstado.style.display = texto ? 'flex' : 'none';
  gmlEstado.className = 'estado ' + (clase || '');
  gmlEstadoTexto.textContent = texto || '';
}

function renderChecks(contenedorId, checks) {
  var icono = function (n) { return n === 'ok' ? '✅' : n === 'aviso' ? '⚠️' : '🔴'; };
  document.getElementById(contenedorId).innerHTML = checks.map(function (c) {
    return '<div class="gml-check ' + c.nivel + '">' +
      '<div class="gml-ico">' + icono(c.nivel) + '</div>' +
      '<div><strong>' + escaparHTML(c.titulo) + '</strong><span>' + escaparHTML(c.detalle) + '</span></div></div>';
  }).join('');
}

function renderResumenGml() {
  var todos = _gmlChecks.concat(_gmlChecksCat);
  var errores = todos.filter(function (c) { return c.nivel === 'error'; }).length;
  var avisos  = todos.filter(function (c) { return c.nivel === 'aviso'; }).length;
  var el = document.getElementById('gmlResumen');
  if (errores > 0) {
    el.className = 'gml-resumen noapto';
    el.textContent = '🔴 NO APTO — ' + errores + ' defecto(s) grave(s)' + (avisos ? ' · ' + avisos + ' advertencia(s)' : '');
  } else if (avisos > 0) {
    el.className = 'gml-resumen avisos';
    el.textContent = '🟡 APTO CON ADVERTENCIAS — ' + avisos + ' punto(s) a revisar';
  } else {
    el.className = 'gml-resumen apto';
    el.textContent = '🟢 APTO — sin defectos detectados';
  }
}

function renderParcelasGml() {
  var parcelas = _gmlParseado.parcelas;
  // Croquis
  document.getElementById('gmlMapa').innerHTML =
    dibujarParcelasSVG(parcelas, _gmlVecinas, 320, 230);
  // Tabla resumen
  var filas = parcelas.map(function (p, i) {
    return '<tr><td>' + (i + 1) + '</td>' +
      '<td>' + escaparHTML(p.refCatastral || '—') + '</td>' +
      '<td>' + (p.epsg ? 'EPSG:' + p.epsg : '—') + '</td>' +
      '<td>' + (p.areaCalculada != null ? p.areaCalculada.toFixed(1) + ' m²' : '—') + '</td></tr>';
  }).join('');
  document.getElementById('gmlTabla').innerHTML =
    '<table class="gml-parcelas-tabla"><thead><tr>' +
    '<th>#</th><th>Ref. catastral</th><th>CRS</th><th>Superficie</th>' +
    '</tr></thead><tbody>' + filas + '</tbody></table>';
}

function procesarFicheroGML(file) {
  if (file.size > 15 * 1024 * 1024) {
    setGmlEstado('error', 'Fichero demasiado grande (máx. 15 MB).');
    return;
  }
  _gmlNombre = file.name;
  setGmlEstado('procesando', 'Analizando ' + file.name + '…');
  gmlResultado.style.display = 'none';
  _gmlChecksCat = [];
  _gmlVecinas = [];
  document.getElementById('gmlChecksCatastro').innerHTML = '';

  var reader = new FileReader();
  reader.onload = function () {
    try {
      var res = parseGML(reader.result);
      if (!res.ok) {
        setGmlEstado('error', res.error);
        return;
      }
      _gmlParseado = res;

      // Contexto desde la escritura analizada (si la hay)
      var ctx = {};
      if (_ultimoAnalisis) {
        ctx.tipoOperacion = _ultimoAnalisis.tipoOperacion && _ultimoAnalisis.tipoOperacion.value;
        ctx.superficieEscritura = _ultimoAnalisis.superficie && _ultimoAnalisis.superficie.numerico;
        ctx.refCatastralEscritura = _ultimoAnalisis.refCatastral && _ultimoAnalisis.refCatastral.value;
      }

      _gmlChecks = validarGML(res, ctx);
      renderChecks('gmlChecks', _gmlChecks);
      renderParcelasGml();
      renderResumenGml();

      // El cruce catastral requiere un CRS UTM válido
      var epsgOk = res.parcelas.some(function (p) { return p.epsg && /^(2582[89]|2583[01]|408[23])$/.test(p.epsg); });
      btnGmlCatastro.disabled = !epsgOk;
      document.getElementById('gmlCatastroHint').textContent = epsgOk
        ? 'Descarga las parcelas vecinas del Catastro (WFS INSPIRE) y comprueba si la geometría aportada invade fincas colindantes.'
        : 'Cruce no disponible: el GML no declara un CRS oficial (ETRS89/REGCAN95 UTM).';

      setGmlEstado('ok', '✓ ' + res.parcelas.length + ' parcela(s) analizadas' +
        (ctx.tipoOperacion ? ' · operación: ' + ctx.tipoOperacion : ' · (sin escritura analizada: validación solo geométrica)'));
      gmlResultado.style.display = 'block';
    } catch (e) {
      setGmlEstado('error', 'Error procesando el GML: ' + e.message);
    }
  };
  reader.onerror = function () { setGmlEstado('error', 'No se pudo leer el fichero.'); };
  reader.readAsText(file);
}

// Click / drag&drop en la zona de carga
gmlZone.addEventListener('click', function () { gmlInput.click(); });
gmlInput.addEventListener('change', function (e) {
  if (e.target.files[0]) procesarFicheroGML(e.target.files[0]);
  gmlInput.value = '';
});
gmlZone.addEventListener('dragover', function (e) { e.preventDefault(); gmlZone.style.borderColor = '#1e3a5f'; });
gmlZone.addEventListener('dragleave', function () { gmlZone.style.borderColor = ''; });
gmlZone.addEventListener('drop', function (e) {
  e.preventDefault();
  gmlZone.style.borderColor = '';
  if (e.dataTransfer.files[0]) procesarFicheroGML(e.dataTransfer.files[0]);
});

// ── Cruce con parcelario catastral (vecinas) ──────────────────
btnGmlCatastro.addEventListener('click', function () {
  if (!_gmlParseado || !_gmlParseado.parcelas.length) return;
  btnGmlCatastro.disabled = true;
  setGmlEstado('procesando', 'Descargando parcelario catastral del entorno (WFS INSPIRE)…');

  var parcelas = _gmlParseado.parcelas;
  // Si el GML no trae refCatastral, usar la de la escritura analizada
  if (!parcelas[0].refCatastral && _ultimoAnalisis && _ultimoAnalisis.refCatastral) {
    parcelas[0].refCatastral = _ultimoAnalisis.refCatastral.value;
  }
  var bb = bboxConsulta(parcelas, 10);

  chrome.runtime.sendMessage(
    { type: 'CONSULTA_GML_BBOX', minX: bb.minX, minY: bb.minY, maxX: bb.maxX, maxY: bb.maxY, epsg: bb.epsg },
    function (resp) {
      btnGmlCatastro.disabled = false;
      if (!resp || !resp.ok) {
        setGmlEstado('error', 'No se pudo consultar el Catastro: ' + (resp && resp.error || 'sin respuesta') + '. Comprueba la conexión.');
        return;
      }
      try {
        var resultado = cruzarConParcelario(parcelas, resp.xml);
        _gmlChecksCat = resultado.checks;
        _gmlVecinas   = resultado.vecinas;
        renderChecks('gmlChecksCatastro', _gmlChecksCat);
        renderParcelasGml(); // redibujar croquis con vecinas
        renderResumenGml();
        setGmlEstado('ok', '✓ Cruce completado: ' + _gmlVecinas.length + ' parcela(s) catastrales en el entorno');
      } catch (e) {
        setGmlEstado('error', 'Error en el cruce: ' + e.message);
      }
    }
  );
});

// ── Informe PDF ───────────────────────────────────────────────
document.getElementById('btnInformeGml').addEventListener('click', function () {
  if (!_gmlParseado) return;
  var html = generarInformeGML(
    _gmlNombre || 'fichero.gml',
    _gmlParseado.parcelas,
    _gmlChecks.concat(_gmlChecksCat),
    _gmlVecinas
  );
  // Mismo patrón que factura.js: Blob URL + window.open
  var blob = new Blob([html], { type: 'text/html; charset=utf-8' });
  var url  = URL.createObjectURL(blob);
  var win  = window.open(url, '_blank');
  setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  if (!win) {
    alert('El navegador bloqueó la ventana emergente.\nPermite ventanas emergentes para esta extensión e inténtalo de nuevo.');
  }
});

// ── Concordancia GML ↔ descripción literal ────────────────────
document.getElementById('btnGmlConc').addEventListener('click', function () {
  if (!_gmlParseado || !_gmlParseado.parcelas.length) {
    var r = document.getElementById('gmlConcResult');
    r.className = 'gml-conc-resultado aviso';
    r.textContent = 'Carga primero un fichero GML.';
    r.style.display = 'block';
    return;
  }

  // Superficie total del GML (suma de parcelas)
  var supGML = _gmlParseado.parcelas.reduce(function (sum, p) {
    return sum + (p.areaCalculada || 0);
  }, 0);

  var rawEsc = document.getElementById('gmlConcSupEsc').value;
  var res    = concordanciaSuperficie(supGML, rawEsc);

  var resEl = document.getElementById('gmlConcResult');
  resEl.className = 'gml-conc-resultado ' + res.nivel;
  resEl.innerHTML =
    '<strong>' + res.msg + '</strong>' +
    (res.supEsc !== null
      ? '<br><small>GML: ' + supGML.toFixed(2) + ' m²  ·  Escritura: ' + res.supEsc.toFixed(2) + ' m²</small>'
      : '');
  resEl.style.display = 'block';

  // Extraer linderos del texto
  var textoLind = document.getElementById('gmlConcLinderos').value;
  var lind = extraerLinderos(textoLind);
  var hayLind = Object.values(lind).some(Boolean);
  var lindRes = document.getElementById('gmlLinderosResult');
  if (hayLind) {
    var dirs = { norte: 'Norte', sur: 'Sur', este: 'Este', oeste: 'Oeste' };
    document.getElementById('gmlLinderosFila').innerHTML = Object.entries(dirs).map(function (en) {
      var dir = en[0], label = en[1];
      var val = lind[dir];
      return '<div class="gml-lindero-fila">' +
        '<span class="gml-lindero-dir">' + label + '</span>' +
        (val
          ? '<span class="gml-lindero-val">' + val + '</span>'
          : '<span class="gml-lindero-vacio">No detectado</span>') +
        '</div>';
    }).join('');
    lindRes.style.display = 'block';
  } else {
    lindRes.style.display = 'none';
  }
});

// ══════════════════════════════════════════════════════════════
// PANEL HERRAMIENTAS — Validador NIF/NIE/CIF + Defectos
// ══════════════════════════════════════════════════════════════

// ── Validador NIF / NIE / CIF ─────────────────────────────────
function ejecutarValidacionNif() {
  var texto = document.getElementById('nifInput').value;
  if (!texto.trim()) return;
  var resultados = validarLista(texto);
  var resEl = document.getElementById('nifResultados');

  resEl.innerHTML = resultados.map(function (r) {
    var cls = r.valido ? 'valido' : 'invalido';
    var etiq = r.valido ? '✓ ' + r.tipo : '✗ ' + (r.tipo || '?');
    return '<div class="nif-fila">' +
      '<span class="nif-id">' + r.id + '</span>' +
      '<span class="nif-badge ' + cls + '">' + etiq + '</span>' +
      '<span class="nif-msg">' + r.msg + '</span>' +
      '</div>';
  }).join('');

  resEl.style.display = resultados.length ? 'block' : 'none';
}

document.getElementById('btnNifValidar').addEventListener('click', ejecutarValidacionNif);
document.getElementById('nifInput').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') ejecutarValidacionNif();
});

// ── Biblioteca de defectos tipificados ───────────────────────
var _defCatActiva = '';
var _defBusqueda  = '';

function renderDefCats() {
  var el = document.getElementById('defCats');
  el.innerHTML = CATEGORIAS.map(function (c) {
    var activa = (c.id === _defCatActiva) ? ' activa' : '';
    return '<button class="def-cat-btn' + activa + '" data-cat="' + c.id + '">' + c.label + '</button>';
  }).join('');
  el.querySelectorAll('.def-cat-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      _defCatActiva = btn.dataset.cat;
      renderDefCats();
      renderDefLista();
    });
  });
}

function renderDefLista() {
  var lista = buscarDefectos(_defBusqueda, _defCatActiva);
  var el = document.getElementById('defLista');
  if (!lista.length) {
    el.innerHTML = '<div class="def-vacio">No se encontraron defectos para esa búsqueda.</div>';
    return;
  }
  el.innerHTML = lista.map(function (d) {
    var dot = d.suspende ? 'suspende' : 'nosusp';
    var dotTitle = d.suspende ? 'Defecto suspensivo' : 'Advertencia / no suspensivo';
    return '<div class="def-item" data-id="' + d.id + '">' +
      '<div class="def-item-header">' +
        '<div class="def-suspende ' + dot + '" title="' + dotTitle + '"></div>' +
        '<span class="def-titulo">' + d.titulo + '</span>' +
        '<span class="def-fund">' + d.fundamento + '</span>' +
      '</div>' +
      '<div class="def-body" id="defbody_' + d.id + '">' +
        '<div class="def-texto">' + d.texto.replace(/</g, '&lt;') + '</div>' +
        '<div class="def-acciones">' +
          '<button class="btn-def-copiar" data-id="' + d.id + '">📋 Copiar texto</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  // Toggle expand/collapse
  el.querySelectorAll('.def-item-header').forEach(function (hdr) {
    hdr.addEventListener('click', function () {
      var id  = hdr.closest('.def-item').dataset.id;
      var body = document.getElementById('defbody_' + id);
      if (body) body.classList.toggle('abierto');
    });
  });

  // Copiar al portapapeles
  el.querySelectorAll('.btn-def-copiar').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var defecto = DEFECTOS.find(function (d) { return d.id === btn.dataset.id; });
      if (!defecto) return;
      navigator.clipboard.writeText(defecto.texto).then(function () {
        btn.textContent = '✓ Copiado';
        btn.classList.add('copiado');
        setTimeout(function () {
          btn.textContent = '📋 Copiar texto';
          btn.classList.remove('copiado');
        }, 2000);
      }).catch(function () {
        btn.textContent = 'Error al copiar';
      });
    });
  });
}

// Inicializar panel herramientas
renderDefCats();
renderDefLista();

document.getElementById('defBuscar').addEventListener('input', function () {
  _defBusqueda = this.value;
  renderDefLista();
});
