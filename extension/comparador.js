// ─────────────────────────────────────────────────────────────
// comparador.js — Comparación entre dos documentos PDF
// Compara los campos extraídos de dos escrituras / documentos
// registrales y detecta discrepancias sin necesidad de sistemas
// externos (Experia, Inforeg, etc.)
// ─────────────────────────────────────────────────────────────

// Extrae el valor legible de un campo parseado
function getValor(campo) {
  if (!campo || campo.value === null || campo.value === undefined) return null;
  if (Array.isArray(campo.value)) return campo.value.join(' · ');
  return String(campo.value).trim() || null;
}

// Normaliza para comparar (quita espacios, minúsculas, sin tildes)
function norm(str) {
  return str
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

// Compara dos números con tolerancia de ±5%
function compararSuperficies(a, b) {
  const na = parseFloat(String(a).replace(/[^\d,.]/g, '').replace(',', '.'));
  const nb = parseFloat(String(b).replace(/[^\d,.]/g, '').replace(',', '.'));
  if (isNaN(na) || isNaN(nb)) return 'revisar';
  const pct = Math.abs(na - nb) / Math.max(na, nb) * 100;
  if (pct === 0)  return 'coincide';
  if (pct < 5)    return 'coincide';  // diferencia menor al 5%, se acepta
  if (pct < 10)   return 'aviso';
  return 'discrepancia';
}

export function compararDocumentos(docA, docB) {
  const filas = [];

  // ── Tipo de operación ─────────────────────────────────────────
  const tipoA = getValor(docA.tipoOperacion);
  const tipoB = getValor(docB.tipoOperacion);
  if (tipoA || tipoB) {
    filas.push({
      campo: 'Tipo de operación',
      valA: tipoA || '—',
      valB: tipoB || '—',
      estado: (!tipoA || !tipoB) ? 'sin-datos'
            : norm(tipoA) === norm(tipoB) ? 'coincide' : 'aviso',
    });
  }

  // ── Fecha ─────────────────────────────────────────────────────
  const fechaA = getValor(docA.fecha);
  const fechaB = getValor(docB.fecha);
  filas.push({
    campo: 'Fecha',
    valA: fechaA || '—',
    valB: fechaB || '—',
    estado: (!fechaA || !fechaB) ? 'sin-datos'
          : norm(fechaA) === norm(fechaB) ? 'coincide' : 'aviso',
    nota: 'En notas simples la fecha es la del asiento, no la de la escritura.',
  });

  // ── Notario ───────────────────────────────────────────────────
  const notA = getValor(docA.notario);
  const notB = getValor(docB.notario);
  if (notA || notB) {
    filas.push({
      campo: 'Notario',
      valA: notA || '—',
      valB: notB || '—',
      estado: (!notA || !notB) ? 'sin-datos'
            : norm(notA) === norm(notB) ? 'coincide' : 'aviso',
    });
  }

  // ── Referencia catastral ──────────────────────────────────────
  const rcA = getValor(docA.refCatastral);
  const rcB = getValor(docB.refCatastral);
  filas.push({
    campo: 'Ref. Catastral',
    valA: rcA || '—',
    valB: rcB || '—',
    estado: (!rcA && !rcB) ? 'sin-datos'
          : (!rcA || !rcB) ? 'aviso'
          : norm(rcA) === norm(rcB) ? 'coincide' : 'discrepancia',
    critico: true,
  });

  // ── Titulares ─────────────────────────────────────────────────
  const titA = getValor(docA.titulares);
  const titB = getValor(docB.titulares);
  if (titA || titB) {
    filas.push({
      campo: 'Titulares',
      valA: titA || '—',
      valB: titB || '—',
      estado: (!titA || !titB) ? 'sin-datos'
            : norm(titA) === norm(titB) ? 'coincide' : 'aviso',
      nota: 'Compara titulares de ambos documentos.',
    });
  }

  // ── NIF / DNI ─────────────────────────────────────────────────
  const dnisA = docA.documentos?.value || [];
  const dnisB = docB.documentos?.value || [];
  if (dnisA.length > 0 || dnisB.length > 0) {
    const soloA = dnisA.filter(d => !dnisB.includes(d));
    const soloB = dnisB.filter(d => !dnisA.includes(d));
    const hayDif = soloA.length > 0 || soloB.length > 0;
    let nota = '';
    if (soloA.length > 0) nota += 'Solo en doc. A: ' + soloA.join(', ') + '. ';
    if (soloB.length > 0) nota += 'Solo en doc. B: ' + soloB.join(', ') + '.';
    filas.push({
      campo: 'NIF / DNI',
      valA: dnisA.length > 0 ? dnisA.join(' · ') : '—',
      valB: dnisB.length > 0 ? dnisB.join(' · ') : '—',
      estado: (!dnisA.length && !dnisB.length) ? 'sin-datos'
            : hayDif ? 'aviso' : 'coincide',
      nota: nota || null,
    });
  }

  // ── Superficie ────────────────────────────────────────────────
  const supA = getValor(docA.superficie);
  const supB = getValor(docB.superficie);
  const estadoSup = (!supA && !supB) ? 'sin-datos'
                  : (!supA || !supB) ? 'sin-datos'
                  : compararSuperficies(supA, supB);
  filas.push({
    campo: 'Superficie',
    valA: supA || '—',
    valB: supB || '—',
    estado: estadoSup,
    critico: estadoSup === 'discrepancia',
    nota: estadoSup === 'discrepancia'
      ? '⚠️ Diferencia superior al 10%. Posible exceso de cabida (art. 201 LH).'
      : estadoSup === 'aviso'
      ? 'Diferencia entre 5-10%. Verificar.'
      : null,
  });

  // ── Precio ────────────────────────────────────────────────────
  const precA = getValor(docA.precio);
  const precB = getValor(docB.precio);
  if (precA || precB) {
    filas.push({
      campo: 'Precio / Valor',
      valA: precA || '—',
      valB: precB || '—',
      estado: (!precA || !precB) ? 'sin-datos'
            : norm(precA) === norm(precB) ? 'coincide' : 'aviso',
    });
  }

  // ── Cargas ────────────────────────────────────────────────────
  const cargasA = getValor(docA.cargas);
  const cargasB = getValor(docB.cargas);
  if (cargasA || cargasB) {
    filas.push({
      campo: 'Cargas',
      valA: cargasA || '—',
      valB: cargasB || '—',
      estado: (!cargasA || !cargasB) ? 'sin-datos'
            : norm(cargasA) === norm(cargasB) ? 'coincide' : 'aviso',
      nota: (cargasA && cargasB && norm(cargasA) !== norm(cargasB))
        ? 'Las cargas difieren. Verificar cancelación previa o simultánea.' : null,
    });
  }

  // ── Resumen ───────────────────────────────────────────────────
  const discrepancias = filas.filter(f => f.estado === 'discrepancia').length;
  const avisos       = filas.filter(f => f.estado === 'aviso').length;

  let resumen;
  if (discrepancias > 0) {
    resumen = {
      nivel: 'rojo',
      texto: discrepancias + ' discrepancia' + (discrepancias > 1 ? 's' : '') +
             ' crítica' + (discrepancias > 1 ? 's' : '') + ' detectada' +
             (discrepancias > 1 ? 's' : '') + '. Revisar antes de inscribir.',
    };
  } else if (avisos > 0) {
    resumen = {
      nivel: 'naranja',
      texto: avisos + ' punto' + (avisos > 1 ? 's' : '') +
             ' a verificar entre los dos documentos.',
    };
  } else {
    resumen = {
      nivel: 'verde',
      texto: 'Los documentos coinciden en todos los campos detectados.',
    };
  }

  return { filas, resumen };
}
