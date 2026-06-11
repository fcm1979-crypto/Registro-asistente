// ─────────────────────────────────────────────────────────────
// gml.js — Validador de georreferenciación (art. 9.b y 199 LH)
// Parsea ficheros GML (INSPIRE CP / RGA), valida CRS, geometría
// y detecta solapes con el parcelario catastral. 100% local.
// ─────────────────────────────────────────────────────────────

// ── Sistemas de referencia admitidos ──────────────────────────
// Resolución conjunta DGRN-DGC 26/10/2015: ETRS89 (Península y
// Baleares) o REGCAN95 (Canarias), proyección UTM.
const EPSG_VALIDOS = {
  '25828': 'ETRS89 / UTM huso 28N',
  '25829': 'ETRS89 / UTM huso 29N',
  '25830': 'ETRS89 / UTM huso 30N',
  '25831': 'ETRS89 / UTM huso 31N',
  '4082':  'REGCAN95 / UTM huso 27N (Canarias)',
  '4083':  'REGCAN95 / UTM huso 28N (Canarias)',
};

const EPSG_PROBLEMATICOS = {
  '4326':  'WGS84 geográficas (lat/lon) — NO es el sistema oficial',
  '4258':  'ETRS89 geográficas (lat/lon) — debe ir en proyección UTM',
  '32628': 'WGS84 / UTM 28N — en Canarias debe ser REGCAN95',
  '32629': 'WGS84 / UTM 29N — debe ser ETRS89',
  '32630': 'WGS84 / UTM 30N — debe ser ETRS89',
  '32631': 'WGS84 / UTM 31N — debe ser ETRS89',
};

// ── Utilidades de namespace ───────────────────────────────────
function porLocalName(root, name) {
  // Busca elementos por localName ignorando prefijos de namespace.
  // Recorrido recursivo puro: funciona en cualquier parser DOM.
  const out = [];
  (function recorrer(nodo) {
    if (!nodo) return;
    if (nodo.nodeType === 1) {
      const ln = (nodo.localName || nodo.tagName || '').split(':').pop();
      if (ln === name) out.push(nodo);
    }
    let hijo = nodo.firstElementChild || nodo.firstChild;
    while (hijo) {
      if (hijo.nodeType === 1) recorrer(hijo);
      hijo = hijo.nextElementSibling || hijo.nextSibling;
    }
  })(root.documentElement || root);
  return out;
}

function extraerEPSG(srsName) {
  if (!srsName) return null;
  // Formatos: "urn:ogc:def:crs:EPSG::25830" | "EPSG:25830" |
  // "http://www.opengis.net/def/crs/EPSG/0/25830"
  const m = srsName.match(/EPSG[:\/]+(?:0\/)?:?(\d{4,5})/i);
  return m ? m[1] : null;
}

// ── Parser principal ──────────────────────────────────────────
/**
 * Parsea un fichero GML y devuelve las parcelas con sus anillos.
 * Soporta GML catastral INSPIRE (cp:CadastralParcel) y GML de
 * representación gráfica alternativa (gml:Polygon / Surface).
 */
export function parseGML(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');

  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    return { ok: false, error: 'El fichero no es un XML válido: ' + parserError.textContent.slice(0, 120) };
  }

  // Detectar excepciones del servicio WFS
  const excepcion = porLocalName(doc, 'ExceptionText')[0];
  if (excepcion) {
    return { ok: false, error: 'Respuesta de error del Catastro: ' + excepcion.textContent.trim().slice(0, 200) };
  }

  const parcelas = [];

  // ── Caso 1: GML catastral INSPIRE (CadastralParcel) ─────────
  const cadParcels = porLocalName(doc, 'CadastralParcel');
  if (cadParcels.length > 0) {
    for (const cp of cadParcels) {
      const parcela = extraerParcela(cp);
      // Referencia catastral (nationalCadastralReference o localId)
      const refEl = porLocalName(cp, 'nationalCadastralReference')[0] ||
                    porLocalName(cp, 'localId')[0];
      parcela.refCatastral = refEl ? refEl.textContent.trim() : null;
      // Superficie declarada (areaValue)
      const areaEl = porLocalName(cp, 'areaValue')[0];
      parcela.areaDeclarada = areaEl ? parseFloat(areaEl.textContent) : null;
      parcelas.push(parcela);
    }
  } else {
    // ── Caso 2: GML "suelto" (RGA): Surface / Polygon ─────────
    // Jerarquía: usar el contenedor de mayor nivel disponible
    // para no duplicar geometrías anidadas.
    let contenedores = porLocalName(doc, 'Surface');
    if (contenedores.length === 0) contenedores = porLocalName(doc, 'Polygon');
    if (contenedores.length === 0) contenedores = porLocalName(doc, 'PolygonPatch');
    for (const geom of contenedores) {
      const parcela = extraerParcela(geom);
      parcela.refCatastral = null;
      parcela.areaDeclarada = null;
      if (parcela.exteriores.length > 0) parcelas.push(parcela);
    }
  }

  if (parcelas.length === 0) {
    return { ok: false, error: 'No se encontró ninguna geometría de parcela en el fichero. ¿Es un GML de parcela catastral o de representación gráfica?' };
  }

  // srsName a nivel de documento si las parcelas no lo traen
  const srsGlobal = buscarSrsName(doc.documentElement);
  for (const p of parcelas) {
    if (!p.srsName && srsGlobal) {
      p.srsName = srsGlobal;
      p.epsg = extraerEPSG(srsGlobal);
    }
  }

  return { ok: true, parcelas };
}

function buscarSrsName(el) {
  if (!el) return null;
  if (el.getAttribute && el.getAttribute('srsName')) return el.getAttribute('srsName');
  for (const hijo of el.children || []) {
    const r = buscarSrsName(hijo);
    if (r) return r;
  }
  return null;
}

function extraerParcela(nodo) {
  // srsName: en el propio nodo o en su geometría descendiente
  let srsName = nodo.getAttribute('srsName') || null;
  if (!srsName) {
    const geom = porLocalName(nodo, 'MultiSurface')[0] ||
                 porLocalName(nodo, 'Surface')[0] ||
                 porLocalName(nodo, 'Polygon')[0];
    if (geom) srsName = geom.getAttribute('srsName') ||
      (porLocalName(geom, 'posList')[0] && porLocalName(geom, 'posList')[0].getAttribute('srsName'));
  }

  // Anillos: exterior(es) e interior(es)
  const exteriores = [];
  const interiores = [];

  for (const ext of porLocalName(nodo, 'exterior')) {
    const anillo = leerAnillo(ext);
    if (anillo.length) exteriores.push(anillo);
  }
  for (const int of porLocalName(nodo, 'interior')) {
    const anillo = leerAnillo(int);
    if (anillo.length) interiores.push(anillo);
  }
  // GML sin exterior/interior explícito (posList directo)
  if (exteriores.length === 0) {
    const pls = porLocalName(nodo, 'posList');
    for (const pl of pls) {
      const anillo = leerPosList(pl);
      if (anillo.length) exteriores.push(anillo);
    }
  }

  return { srsName, epsg: extraerEPSG(srsName), exteriores, interiores };
}

function leerAnillo(contenedor) {
  const pl = porLocalName(contenedor, 'posList')[0];
  if (pl) return leerPosList(pl);
  // Formato antiguo: gml:coordinates "x,y x,y ..."
  const coords = porLocalName(contenedor, 'coordinates')[0];
  if (coords) {
    return coords.textContent.trim().split(/\s+/)
      .map(par => par.split(',').map(Number))
      .filter(p => p.length >= 2 && p.every(isFinite));
  }
  return [];
}

function leerPosList(pl) {
  const dim = parseInt(pl.getAttribute('srsDimension') || '2', 10);
  const nums = pl.textContent.trim().split(/\s+/).map(Number);
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += dim) {
    if (isFinite(nums[i]) && isFinite(nums[i + 1])) pts.push([nums[i], nums[i + 1]]);
  }
  return pts;
}

// ── Geometría ─────────────────────────────────────────────────
export function areaShoelace(anillo) {
  let a = 0;
  for (let i = 0; i < anillo.length - 1; i++) {
    a += anillo[i][0] * anillo[i + 1][1] - anillo[i + 1][0] * anillo[i][1];
  }
  return Math.abs(a / 2);
}

function bbox(anillo) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of anillo) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

function bboxSolapan(a, b, margen = 0) {
  return !(a.maxX + margen < b.minX || b.maxX + margen < a.minX ||
           a.maxY + margen < b.minY || b.maxY + margen < a.minY);
}

function segmentosSeCruzan(p1, p2, p3, p4) {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < 1e-12) return false; // paralelos
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  // Cruce estricto (no toques en vértices, tolerancia 1 mm)
  const eps = 1e-6;
  return t > eps && t < 1 - eps && u > eps && u < 1 - eps;
}

export function puntoEnPoligono(pt, anillo) {
  // Ray casting
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const xi = anillo[i][0], yi = anillo[i][1];
    const xj = anillo[j][0], yj = anillo[j][1];
    if (((yi > pt[1]) !== (yj > pt[1])) &&
        (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) {
      dentro = !dentro;
    }
  }
  return dentro;
}

function autoIntersecciones(anillo) {
  const cruces = [];
  const n = anillo.length - 1; // último = primero
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // segmentos adyacentes por el cierre
      if (segmentosSeCruzan(anillo[i], anillo[i + 1], anillo[j], anillo[j + 1])) {
        cruces.push([i, j]);
      }
    }
  }
  return cruces;
}

/**
 * Estima el área de intersección entre dos anillos por muestreo
 * en rejilla sobre la intersección de sus bounding boxes.
 * Precisión suficiente para alertar (±2-3%), todo en local.
 */
export function areaSolape(anilloA, anilloB, resolucion = 120) {
  const ba = bbox(anilloA), bb = bbox(anilloB);
  if (!bboxSolapan(ba, bb)) return 0;
  const minX = Math.max(ba.minX, bb.minX), maxX = Math.min(ba.maxX, bb.maxX);
  const minY = Math.max(ba.minY, bb.minY), maxY = Math.min(ba.maxY, bb.maxY);
  const w = maxX - minX, h = maxY - minY;
  if (w <= 0 || h <= 0) return 0;
  const pasoX = w / resolucion, pasoY = h / resolucion;
  let dentro = 0;
  for (let i = 0; i < resolucion; i++) {
    for (let j = 0; j < resolucion; j++) {
      const pt = [minX + (i + 0.5) * pasoX, minY + (j + 0.5) * pasoY];
      if (puntoEnPoligono(pt, anilloA) && puntoEnPoligono(pt, anilloB)) dentro++;
    }
  }
  return (dentro / (resolucion * resolucion)) * w * h;
}


// ── Validaciones ──────────────────────────────────────────────
/**
 * Ejecuta todas las comprobaciones sobre el GML parseado.
 * @param {object} resultado  salida de parseGML
 * @param {object} contexto   { tipoOperacion, superficieEscritura, refCatastralEscritura }
 * @returns {Array} checks [{nivel:'ok'|'aviso'|'error', titulo, detalle}]
 */
export function validarGML(resultado, contexto = {}) {
  const checks = [];
  const parcelas = resultado.parcelas;

  // ── 1. Sistema de referencia ────────────────────────────────
  for (let i = 0; i < parcelas.length; i++) {
    const p = parcelas[i];
    const tag = parcelas.length > 1 ? ' (parcela ' + (i + 1) + ')' : '';
    if (!p.epsg) {
      checks.push({
        nivel: 'error',
        titulo: 'Sistema de coordenadas no declarado' + tag,
        detalle: 'El fichero no incluye atributo srsName. Sin CRS declarado no es posible verificar que las coordenadas estén en ETRS89/REGCAN95 UTM (Resolución conjunta 26-10-2015, apartado 7º).',
      });
    } else if (EPSG_VALIDOS[p.epsg]) {
      checks.push({
        nivel: 'ok',
        titulo: 'Sistema de coordenadas: ' + EPSG_VALIDOS[p.epsg] + tag,
        detalle: 'EPSG:' + p.epsg + ' — conforme con el sistema geodésico oficial.',
      });
    } else if (EPSG_PROBLEMATICOS[p.epsg]) {
      checks.push({
        nivel: 'error',
        titulo: 'Sistema de coordenadas NO oficial' + tag,
        detalle: 'EPSG:' + p.epsg + ' (' + EPSG_PROBLEMATICOS[p.epsg] + '). El art. 9.b LH y la Resolución conjunta exigen ETRS89 (Península/Baleares) o REGCAN95 (Canarias) en proyección UTM.',
      });
    } else {
      checks.push({
        nivel: 'aviso',
        titulo: 'Sistema de coordenadas desconocido' + tag,
        detalle: 'EPSG:' + p.epsg + ' no reconocido. Verificar manualmente que corresponde a ETRS89/REGCAN95 UTM.',
      });
    }
  }

  // Husos mezclados entre parcelas
  const epsgs = [...new Set(parcelas.map(p => p.epsg).filter(Boolean))];
  if (epsgs.length > 1) {
    checks.push({
      nivel: 'error',
      titulo: 'Parcelas en husos UTM distintos',
      detalle: 'El fichero mezcla sistemas (' + epsgs.map(e => 'EPSG:' + e).join(', ') + '). Todas las fincas de una misma operación deben ir en el mismo CRS.',
    });
  }

  // ── 2. Geometría de cada parcela ────────────────────────────
  parcelas.forEach((p, i) => {
    const tag = parcelas.length > 1 ? ' (parcela ' + (i + 1) + ')' : '';

    if (p.exteriores.length === 0) {
      checks.push({ nivel: 'error', titulo: 'Sin anillo exterior' + tag, detalle: 'No se pudo extraer el perímetro de la parcela.' });
      return;
    }

    p.exteriores.forEach((anillo, k) => {
      const tagAnillo = p.exteriores.length > 1 ? tag + ' [recinto ' + (k + 1) + ']' : tag;

      // Vértices mínimos
      if (anillo.length < 4) {
        checks.push({
          nivel: 'error',
          titulo: 'Geometría insuficiente' + tagAnillo,
          detalle: 'Solo ' + anillo.length + ' vértices. Un polígono cerrado requiere al menos 3 vértices distintos + cierre.',
        });
        return;
      }

      // Cierre del anillo
      const primero = anillo[0], ultimo = anillo[anillo.length - 1];
      const distCierre = Math.hypot(primero[0] - ultimo[0], primero[1] - ultimo[1]);
      if (distCierre > 0.001) { // 1 mm de tolerancia
        checks.push({
          nivel: 'error',
          titulo: 'Polígono no cerrado' + tagAnillo,
          detalle: 'El primer vértice (' + primero[0].toFixed(2) + ', ' + primero[1].toFixed(2) + ') y el último (' + ultimo[0].toFixed(2) + ', ' + ultimo[1].toFixed(2) + ') no coinciden (separados ' + distCierre.toFixed(2) + ' m). El anillo debe ser cerrado.',
        });
      } else {
        checks.push({
          nivel: 'ok',
          titulo: 'Anillo cerrado' + tagAnillo,
          detalle: anillo.length - 1 + ' vértices, perímetro válido.',
        });
      }

      // Vértices duplicados consecutivos
      let duplicados = 0;
      for (let v = 0; v < anillo.length - 1; v++) {
        if (Math.hypot(anillo[v][0] - anillo[v + 1][0], anillo[v][1] - anillo[v + 1][1]) < 0.001) duplicados++;
      }
      if (duplicados > 0) {
        checks.push({
          nivel: 'aviso',
          titulo: 'Vértices duplicados' + tagAnillo,
          detalle: duplicados + ' vértice(s) consecutivo(s) repetido(s). Puede provocar rechazo en la validación catastral.',
        });
      }

      // Auto-intersección
      const cruces = autoIntersecciones(anillo);
      if (cruces.length > 0) {
        checks.push({
          nivel: 'error',
          titulo: 'Polígono auto-intersecado' + tagAnillo,
          detalle: 'El perímetro se cruza consigo mismo en ' + cruces.length + ' punto(s) (segmentos ' + cruces.slice(0, 3).map(c => c[0] + '–' + c[1]).join(', ') + '). Geometría inválida.',
        });
      }

      // Coordenadas en rango UTM razonable para España
      const bb = bbox(anillo);
      const xOk = bb.minX > 100000 && bb.maxX < 1100000;
      const yOk = bb.minY > 3000000 && bb.maxY < 4900000;
      if (EPSG_VALIDOS[p.epsg] && (!xOk || !yOk)) {
        checks.push({
          nivel: 'aviso',
          titulo: 'Coordenadas fuera de rango esperado' + tagAnillo,
          detalle: 'Los valores (X: ' + Math.round(bb.minX) + '–' + Math.round(bb.maxX) + ', Y: ' + Math.round(bb.minY) + '–' + Math.round(bb.maxY) + ') no parecen UTM de territorio español. Posible CRS mal declarado o coordenadas desplazadas.',
        });
      }
    });

    // Superficie calculada vs declarada
    const areaCalc = p.exteriores.reduce((s, a) => s + areaShoelace(a), 0) -
                     p.interiores.reduce((s, a) => s + areaShoelace(a), 0);
    p.areaCalculada = areaCalc;

    if (p.areaDeclarada) {
      const diff = Math.abs(areaCalc - p.areaDeclarada);
      const pct = (diff / p.areaDeclarada) * 100;
      checks.push({
        nivel: pct > 2 ? 'aviso' : 'ok',
        titulo: 'Superficie: ' + areaCalc.toFixed(2) + ' m² calculados' + tag,
        detalle: 'Declarada en el GML: ' + p.areaDeclarada.toFixed(2) + ' m² (diferencia ' + pct.toFixed(2) + '%).' + (pct > 2 ? ' Diferencia superior al 2%: revisar.' : ''),
      });
    } else {
      checks.push({
        nivel: 'ok',
        titulo: 'Superficie calculada: ' + areaCalc.toFixed(2) + ' m²' + tag,
        detalle: 'Calculada por coordenadas (fórmula de Gauss).',
      });
    }
  });

  // ── 3. Solape entre parcelas del propio fichero ─────────────
  // Por área muestreada: fincas resultantes de una segregación
  // comparten linde (válido) pero no pueden superponerse en área.
  for (let i = 0; i < parcelas.length; i++) {
    for (let j = i + 1; j < parcelas.length; j++) {
      const a = parcelas[i].exteriores[0], b = parcelas[j].exteriores[0];
      if (!a || !b) continue;
      const area = areaSolape(a, b);
      if (area > 0.5) {
        checks.push({
          nivel: 'error',
          titulo: 'Solape entre parcelas ' + (i + 1) + ' y ' + (j + 1) + ' del fichero',
          detalle: 'Superficie de solape estimada: ' + area.toFixed(2) + ' m². Las fincas resultantes de una división/segregación no pueden superponerse.',
        });
      }
    }
  }

  // ── 4. Coherencia con la operación de la escritura ──────────
  const tipo = (contexto.tipoOperacion || '').toLowerCase();
  if (/segregacion|division|parcelacion/.test(tipo) && parcelas.length < 2) {
    checks.push({
      nivel: 'error',
      titulo: 'Falta la finca resto',
      detalle: 'La operación detectada en la escritura es ' + tipo + ' pero el fichero solo contiene 1 parcela. El art. 9.b LH y la doctrina DGSJFP (RR. 24-10-2016, 11-4-2019) exigen aportar la georreferenciación de TODAS las fincas resultantes, incluida la finca resto.',
    });
  }
  if (/agrupacion/.test(tipo) && parcelas.length > 1) {
    checks.push({
      nivel: 'aviso',
      titulo: 'Agrupación con varias parcelas en el GML',
      detalle: 'En una agrupación, la finca resultante es una sola. Verificar que el GML aportado corresponde a la finca agrupada final, no a las de origen.',
    });
  }

  // Referencia catastral del GML vs escritura
  if (contexto.refCatastralEscritura) {
    const refsGml = parcelas.map(p => p.refCatastral).filter(Boolean);
    if (refsGml.length > 0) {
      const coincide = refsGml.some(r => r.toUpperCase().includes(contexto.refCatastralEscritura.toUpperCase().slice(0, 14)));
      checks.push(coincide ? {
        nivel: 'ok',
        titulo: 'Referencia catastral coherente con la escritura',
        detalle: 'El GML corresponde a la finca ' + contexto.refCatastralEscritura + '.',
      } : {
        nivel: 'error',
        titulo: 'El GML NO corresponde a la finca de la escritura',
        detalle: 'Escritura: ' + contexto.refCatastralEscritura + ' · GML: ' + refsGml.join(', ') + '. Verificar que se aportó el fichero correcto.',
      });
    }
  }

  // Superficie GML vs escritura
  if (contexto.superficieEscritura && parcelas.length === 1 && parcelas[0].areaCalculada) {
    const diff = Math.abs(parcelas[0].areaCalculada - contexto.superficieEscritura);
    const pct = (diff / contexto.superficieEscritura) * 100;
    checks.push({
      nivel: pct > 10 ? 'error' : pct > 5 ? 'aviso' : 'ok',
      titulo: 'Superficie GML vs escritura: diferencia del ' + pct.toFixed(1) + '%',
      detalle: 'Escritura: ' + contexto.superficieEscritura + ' m² · GML: ' + parcelas[0].areaCalculada.toFixed(2) + ' m² (' + diff.toFixed(2) + ' m² de diferencia).' + (pct > 10 ? ' Supera el 10%: posible exceso de cabida (art. 201 LH).' : ''),
    });
  }

  return checks;
}

// ── Cruce con parcelario catastral (vecinas) ──────────────────
/**
 * Compara TODAS las parcelas del GML del usuario contra las
 * parcelas catastrales del entorno (WFS INSPIRE) y detecta
 * invasiones de fincas colindantes.
 *
 * @param {Array|object} parcelasUsuario  parcela(s) de parseGML
 * @param {string} xmlVecinas             respuesta WFS
 * @returns {{checks:Array, vecinas:Array}} checks + parcelas vecinas parseadas
 */
export function cruzarConParcelario(parcelasUsuario, xmlVecinas) {
  const lista = Array.isArray(parcelasUsuario) ? parcelasUsuario : [parcelasUsuario];
  const checks = [];
  const res = parseGML(xmlVecinas);
  if (!res.ok) {
    return { checks: [{ nivel: 'aviso', titulo: 'No se pudo leer el parcelario catastral', detalle: res.error }], vecinas: [] };
  }

  // Referencias propias: las del GML del usuario (cualquier parcela)
  const refsPropias = lista.map(p => (p.refCatastral || '').toUpperCase().slice(0, 14)).filter(Boolean);
  const esPropia = ref => refsPropias.some(rp => rp && ref.includes(rp));

  let vecinasAnalizadas = 0;
  let invasiones = 0;

  for (let u = 0; u < lista.length; u++) {
    const parcelaU = lista[u];
    const anilloUsuario = parcelaU.exteriores[0];
    if (!anilloUsuario) continue;
    const tagU = lista.length > 1 ? ' (parcela ' + (u + 1) + ' del fichero)' : '';

    let mismaParcela = null;

    for (const vecina of res.parcelas) {
      const refVecina = (vecina.refCatastral || '').toUpperCase();
      const anilloVecina = vecina.exteriores[0];
      if (!anilloVecina) continue;

      // ¿Es una de las parcelas propias de la operación?
      if (refVecina && esPropia(refVecina)) {
        if (parcelaU.refCatastral && refVecina.includes(parcelaU.refCatastral.toUpperCase().slice(0, 14))) {
          mismaParcela = vecina;
        }
        continue;
      }
      if (u === 0) vecinasAnalizadas++; // contar vecinas una sola vez

      // Área de solape por muestreo: detecta tanto cruces de borde
      // como invasiones con lindes parcialmente coincidentes.
      const area = areaSolape(anilloUsuario, anilloVecina);
      if (area > 0.5) { // ignorar micro-solapes < 0.5 m² (tolerancia gráfica)
        invasiones++;
        checks.push({
          nivel: 'error',
          titulo: 'SOLAPE con parcela catastral ' + (refVecina || 'colindante') + tagU,
          detalle: 'La geometría aportada invade ' + area.toFixed(2) + ' m² de la parcela ' + (refVecina || 'vecina') + ' según el parcelario catastral vigente. La validación catastral será negativa y cabe oposición del colindante (art. 199 LH).',
        });
      }
    }

    // Comparar con la geometría catastral de la propia finca (desplazamientos)
    if (mismaParcela && mismaParcela.exteriores[0]) {
      const areaInterseccion = areaSolape(anilloUsuario, mismaParcela.exteriores[0]);
      const areaUsuario = areaShoelace(anilloUsuario);
      const areaCatastral = areaShoelace(mismaParcela.exteriores[0]);
      const iou = areaInterseccion / (areaUsuario + areaCatastral - areaInterseccion);
      if (iou > 0.97) {
        checks.push({
          nivel: 'ok',
          titulo: 'Coincidencia con la parcela catastral: ' + (iou * 100).toFixed(1) + '%' + tagU,
          detalle: 'La geometría aportada es esencialmente idéntica a la catastral vigente.',
        });
      } else if (iou > 0.80) {
        checks.push({
          nivel: 'aviso',
          titulo: 'Coincidencia parcial con la catastral: ' + (iou * 100).toFixed(1) + '%' + tagU,
          detalle: 'Es una representación gráfica alternativa (RGA) o existe desplazamiento cartográfico. Recordar: la RGA debe estar firmada/ratificada por el titular, no basta la firma del técnico (Res. conjunta 26-10-2015, apdo. 7º), y si hay desplazamiento debe constar su magnitud y dirección en el informe técnico.',
        });
      } else {
        checks.push({
          nivel: 'error',
          titulo: 'Geometría muy distinta de la catastral (' + (iou * 100).toFixed(1) + '% de coincidencia)' + tagU,
          detalle: 'La parcela aportada difiere sustancialmente de la que figura en Catastro para esa referencia. Verificar referencia catastral, CRS y posible error de medición.',
        });
      }
    }
  }

  if (invasiones === 0 && vecinasAnalizadas > 0) {
    checks.push({
      nivel: 'ok',
      titulo: 'Sin invasión de parcelas colindantes',
      detalle: vecinasAnalizadas + ' parcela(s) vecina(s) analizadas, ningún solape > 0,5 m² detectado.',
    });
  } else if (vecinasAnalizadas === 0 && checks.length === 0) {
    checks.push({
      nivel: 'aviso',
      titulo: 'Sin parcelas vecinas en el entorno consultado',
      detalle: 'El WFS no devolvió parcelas colindantes en el área. Verificar CRS y coordenadas, o que la finca esté en zona aún no parcelada.',
    });
  }

  return { checks, vecinas: res.parcelas };
}

// ── Bounding box para la consulta WFS ─────────────────────────
export function bboxConsulta(parcelas, margen = 10) {
  const lista = Array.isArray(parcelas) ? parcelas : [parcelas];
  const todos = lista.flatMap(p => p.exteriores.flat());
  const bb = bbox(todos);
  return {
    minX: bb.minX - margen, minY: bb.minY - margen,
    maxX: bb.maxX + margen, maxY: bb.maxY + margen,
    epsg: (lista.find(p => p.epsg) || {}).epsg || '25830',
  };
}

// ── Croquis SVG de las parcelas ───────────────────────────────
/**
 * Dibuja un croquis con las parcelas del usuario (azul) y,
 * opcionalmente, las vecinas catastrales (gris). Devuelve SVG.
 */
export function dibujarParcelasSVG(parcelasUsuario, vecinas = [], ancho = 320, alto = 230) {
  const anillosU = parcelasUsuario.flatMap(p => p.exteriores);
  if (anillosU.length === 0) return '';
  const todosU = anillosU.flat();
  const bb = bbox(todosU);
  const margenM = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY) * 0.12 + 2;
  const vista = { minX: bb.minX - margenM, minY: bb.minY - margenM,
                  maxX: bb.maxX + margenM, maxY: bb.maxY + margenM };
  const escala = Math.min(ancho / (vista.maxX - vista.minX), alto / (vista.maxY - vista.minY));
  // Transformación: UTM (Y crece hacia el norte) → SVG (Y crece hacia abajo)
  const tx = x => ((x - vista.minX) * escala).toFixed(1);
  const ty = y => (alto - (y - vista.minY) * escala).toFixed(1);
  const path = anillo => 'M' + anillo.map(p => tx(p[0]) + ',' + ty(p[1])).join('L') + 'Z';

  let svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + ancho + ' ' + alto +
    '" style="width:100%;height:auto;background:#fafbfd;border-radius:6px">';

  // Vecinas (recortadas a la vista)
  for (const v of vecinas) {
    for (const anillo of v.exteriores) {
      const bv = bbox(anillo);
      if (bv.maxX < vista.minX || bv.minX > vista.maxX ||
          bv.maxY < vista.minY || bv.minY > vista.maxY) continue;
      svg += '<path d="' + path(anillo) + '" fill="#e8eaf0" stroke="#b6bcc9" stroke-width="1"/>';
    }
  }
  // Parcelas del usuario
  const colores = ['#1e3a5f', '#2e7d32', '#6a3ab2', '#a86b00'];
  parcelasUsuario.forEach((p, i) => {
    const c = colores[i % colores.length];
    for (const anillo of p.exteriores) {
      svg += '<path d="' + path(anillo) + '" fill="' + c + '22" stroke="' + c + '" stroke-width="1.8"/>';
    }
    // Etiqueta en el centroide aproximado
    const a0 = p.exteriores[0];
    if (a0 && a0.length) {
      const cx = a0.reduce((s, pt) => s + pt[0], 0) / a0.length;
      const cy = a0.reduce((s, pt) => s + pt[1], 0) / a0.length;
      svg += '<text x="' + tx(cx) + '" y="' + ty(cy) + '" font-size="11" font-weight="700" fill="' + c +
        '" text-anchor="middle" font-family="sans-serif">' + (i + 1) + '</text>';
    }
  });
  svg += '</svg>';
  return svg;
}

// ── Escape HTML (el contenido del GML no es de confianza) ─────
export function escaparHTML(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Informe imprimible ────────────────────────────────────────
export function generarInformeGML(nombreFichero, parcelas, checks, vecinas = []) {
  const fecha = new Date().toLocaleString('es-ES');
  const icono = n => n === 'ok' ? '✔' : n === 'aviso' ? '⚠' : '✖';
  const color = n => n === 'ok' ? '#1d7a3e' : n === 'aviso' ? '#a86b00' : '#b3261e';

  const errores = checks.filter(c => c.nivel === 'error').length;
  const avisos  = checks.filter(c => c.nivel === 'aviso').length;
  const veredicto = errores > 0
    ? '<span style="color:#b3261e">✖ NO APTO — ' + errores + ' defecto(s) grave(s)</span>'
    : avisos > 0
    ? '<span style="color:#a86b00">⚠ APTO CON ADVERTENCIAS (' + avisos + ')</span>'
    : '<span style="color:#1d7a3e">✔ APTO — sin defectos detectados</span>';

  const filasParcelas = parcelas.map((p, i) =>
    '<tr><td>' + (i + 1) + '</td><td>' + escaparHTML(p.refCatastral || '—') + '</td><td>' +
    (p.epsg ? 'EPSG:' + p.epsg : '—') + '</td><td>' +
    (p.areaCalculada ? p.areaCalculada.toFixed(2) + ' m²' : '—') + '</td><td>' +
    p.exteriores.reduce((s, a) => s + a.length - 1, 0) + '</td></tr>'
  ).join('');

  const filasChecks = checks.map(c =>
    '<tr><td style="color:' + color(c.nivel) + ';font-weight:700;text-align:center">' + icono(c.nivel) +
    '</td><td><strong>' + escaparHTML(c.titulo) + '</strong><br><span style="color:#555">' + escaparHTML(c.detalle) + '</span></td></tr>'
  ).join('');

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Informe validación GML</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; max-width: 760px; margin: 30px auto; padding: 0 20px; font-size: 13px; }
  h1 { font-size: 19px; border-bottom: 3px solid #1e3a5f; padding-bottom: 8px; }
  h2 { font-size: 14px; color: #1e3a5f; margin-top: 24px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #1e3a5f; color: white; padding: 6px 8px; text-align: left; font-size: 11px; }
  td { padding: 6px 8px; border-bottom: 1px solid #ddd; vertical-align: top; }
  .meta { color: #555; font-size: 11.5px; }
  .veredicto { font-size: 15px; margin: 14px 0; padding: 10px; background: #f5f6fa; border-radius: 6px; }
  footer { margin-top: 30px; font-size: 10px; color: #888; border-top: 1px solid #ccc; padding-top: 8px; }
  @media print { body { margin: 10mm; } }
</style></head><body>
<h1>Informe de validación de georreferenciación</h1>
<p class="meta">Fichero: <strong>${escaparHTML(nombreFichero)}</strong> · Generado: ${fecha} · Registro Asistente v0.3.0</p>
<div class="veredicto">${veredicto}</div>
<h2>Croquis</h2>
<div style="max-width:420px">${dibujarParcelasSVG(parcelas, vecinas, 420, 300)}</div>
<p class="meta">En azul/color, parcelas del fichero aportado (numeradas). En gris, parcelario catastral del entorno${vecinas.length ? '' : ' (no consultado)'}.</p>
<h2>Parcelas detectadas</h2>
<table><thead><tr><th>#</th><th>Ref. catastral</th><th>CRS</th><th>Superficie (calc.)</th><th>Vértices</th></tr></thead>
<tbody>${filasParcelas}</tbody></table>
<h2>Comprobaciones</h2>
<table><thead><tr><th style="width:30px"></th><th>Resultado</th></tr></thead>
<tbody>${filasChecks}</tbody></table>
<footer>Validación automática local conforme a: art. 9.b y 199 LH · Resolución conjunta DGRN-DGC de 26 de octubre de 2015 · Doctrina DGSJFP. Este informe es una herramienta de apoyo a la calificación y no sustituye el juicio del Registrador ni el Informe de Validación Gráfica Alternativa (IVGA) de la Sede Electrónica del Catastro.</footer>
<script>window.onload = function(){ window.print(); };</script>
</body></html>`;
}
