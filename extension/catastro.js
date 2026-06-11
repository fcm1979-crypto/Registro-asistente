// ─────────────────────────────────────────────
// catastro.js — Integración Catastro
// Intenta la API OVC; si falla, usa scraping
// del portal público (accesible desde Chrome).
// ─────────────────────────────────────────────

export async function consultarCatastro(refCatastral) {
  if (!refCatastral || refCatastral.length < 14) {
    return { ok: false, error: 'Referencia catastral inválida' };
  }
  const rc = refCatastral.trim().toUpperCase().replace(/\s/g, '');

  // ── Intento 1: API OVC (JSON-friendly endpoint) ──
  try {
    const resp = await new Promise(function (resolve) {
      chrome.runtime.sendMessage({ type: 'CONSULTA_CATASTRO', rc: rc }, resolve);
    });

    if (resp && resp.ok && resp.xml) {
      const parsed = parsearXML(resp.xml, rc);
      // Si al menos tenemos municipio o superficie, consideramos válido
      if (parsed.ok && (parsed.municipio || parsed.superficie)) {
        return parsed;
      }
    }
  } catch (e) { /* Continúa al fallback */ }

  // ── Intento 2: Endpoint HTML público del Catastro ──
  try {
    const respHtml = await new Promise(function (resolve) {
      chrome.runtime.sendMessage({ type: 'CONSULTA_CATASTRO_HTML', rc: rc }, resolve);
    });

    if (respHtml && respHtml.ok && respHtml.html) {
      return parsearHTML(respHtml.html, rc);
    }
  } catch (e) { /* Continúa */ }

  // ── Fallback: solo enlace al visor ──────────────
  return {
    ok: true,
    refCatastral: rc,
    soloEnlace: true,
    direccion: null, municipio: null, provincia: null,
    superficie: null, uso: null, clase: null, titular: null,
    urlVisorMapa: 'https://www1.sedecatastro.gob.es/Cartografia/mapa.aspx?buscar=S&RC=' + rc,
  };
}

// ── Parser XML (API OVC) ──────────────────────
function parsearXML(xmlText, rc) {
  try {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    const get = t => doc.querySelector(t)?.textContent?.trim() || null;

    const lerr = get('lerr cod');
    if (lerr && lerr !== '0') return { ok: false, error: 'Catastro error: ' + lerr };

    const clase = get('cn');
    return {
      ok: true, refCatastral: rc,
      direccion:   get('ldt'),
      municipio:   get('nm'),
      provincia:   get('np'),
      codigoPostal: get('dp'),
      superficie:  get('sfc') ? parseFloat(get('sfc')) : null,
      uso:         get('luso'),
      clase:       clase === 'U' ? 'Urbano' : clase === 'R' ? 'Rústico' : clase,
      titular:     get('npt'),
      urlVisorMapa: 'https://www1.sedecatastro.gob.es/Cartografia/mapa.aspx?buscar=S&RC=' + rc,
    };
  } catch (e) {
    return { ok: false, error: 'Error parseando XML: ' + e.message };
  }
}

// ── Parser HTML (portal público Catastro) ────
function parsearHTML(html, rc) {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const txt = t => doc.querySelector(t)?.textContent?.trim() || null;

    // El portal usa IDs y clases específicas
    const direccion  = txt('#ctl00_Contenido_tblInmueble .txtDescripcion') ||
                       txt('[id*="Domicilio"]') || txt('[id*="direccion"]');
    const municipio  = txt('[id*="Municipio"]') || txt('[id*="municipio"]');
    const superficie = txt('[id*="Superficie"]') || txt('[id*="superficie"]');
    const uso        = txt('[id*="Uso"]') || txt('[id*="uso"]');

    const supNum = superficie ? parseFloat(superficie.replace(/[^\d,]/g, '').replace(',', '.')) : null;

    return {
      ok: true, refCatastral: rc,
      direccion, municipio,
      superficie: supNum,
      uso, clase: null, titular: null, provincia: null,
      urlVisorMapa: 'https://www1.sedecatastro.gob.es/Cartografia/mapa.aspx?buscar=S&RC=' + rc,
    };
  } catch (e) {
    return { ok: false, error: 'Error parseando portal: ' + e.message };
  }
}

export function alertaSuperficie(supEscritura, supCatastro, umbralPct = 10) {
  if (!supEscritura || !supCatastro) return null;
  const diff = Math.abs(supEscritura - supCatastro);
  const pct  = (diff / supCatastro) * 100;
  return {
    nivel:   pct >= umbralPct ? 'error' : pct >= 5 ? 'aviso' : 'ok',
    mensaje: pct >= umbralPct
      ? '⚠️ Diferencia del ' + pct.toFixed(1) + '% con Catastro (' + diff.toFixed(2) + ' m²). Revisar exceso de cabida.'
      : pct >= 5
      ? '⚠️ Diferencia del ' + pct.toFixed(1) + '% con Catastro (' + diff.toFixed(2) + ' m²).'
      : '✅ Superficie coincide con Catastro (diferencia < 5%)',
  };
}
