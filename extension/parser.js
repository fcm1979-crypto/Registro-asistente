// ─────────────────────────────────────────────
// parser.js — Parser Jurídico de Escrituras v2
// ─────────────────────────────────────────────

function firstMatch(text, patterns) {
  for (const { regex, group } of patterns) {
    const m = text.match(regex);
    if (m) return { value: (m[group ?? 1] || '').trim() || null, raw: m[0] };
  }
  return { value: null, raw: null };
}

function allMatches(text, regex, group) {
  group = group || 1;
  const results = [];
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
  let m;
  while ((m = re.exec(text)) !== null) {
    const val = (m[group] || '').trim();
    if (val && !results.includes(val)) results.push(val);
  }
  return results;
}

function normalizar(str) {
  return str.replace(/\s+/g, ' ').toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// ── 1. Tipo de operación ──────────────────────
function parseTipoOperacion(text) {
  const u = normalizar(text);
  const tipos = [
    { key: 'compraventa',   p: /COMPRAVENTA|ESCRITURA DE COMPRA/ },
    { key: 'hipoteca',      p: /PRESTAMO HIPOTECARIO|CONSTITUCION DE HIPOTECA|HIPOTECA/ },
    { key: 'herencia',      p: /ACEPTACION DE HERENCIA|ADJUDICACION DE HERENCIA/ },
    { key: 'donacion',      p: /ESCRITURA DE DONACION|DONACION/ },
    { key: 'agrupacion',    p: /AGRUPACION DE FINCAS/ },
    { key: 'segregacion',   p: /SEGREGACION|PARCELACION/ },
    { key: 'division',      p: /DIVISION HORIZONTAL|DIVISION DE FINCA|OBRA NUEVA/ },
    { key: 'cancelacion',   p: /CANCELACION DE HIPOTECA|CANCELACION HIPOTECARIA/ },
    { key: 'permuta',       p: /PERMUTA/ },
  ];
  for (const { key, p } of tipos) {
    if (p.test(u)) return { value: key, confidence: 'high' };
  }
  return { value: 'desconocido', confidence: 'low' };
}

// ── 2. Notario ───────────────────────────────

function toTitleCase(str) {
  const minusculas = new Set(['de','del','la','las','el','los','y']);
  return str.toLowerCase().split(' ').map((w, i) =>
    (i === 0 || !minusculas.has(w))
      ? w.charAt(0).toUpperCase() + w.slice(1)
      : w
  ).join(' ');
}

// PDF.js extrae texto negrita carácter a carácter: "C R I S T Ó B A L   S A L I N A S"
// Esta función detecta ese patrón y reconstruye las palabras.
// Doble espacio = separador de palabras; espacio simple = separador de chars en misma palabra.
function reconstruirTextoSpaceado(raw) {
  const tokens = raw.trim().split(/\s+/);
  if (tokens.length < 3) return raw.trim();
  const singles = tokens.filter(t => t.length === 1).length;
  if (singles / tokens.length < 0.6) return raw.trim(); // texto normal

  // Texto spaceado: marcar separadores de palabras (doble espacio o más)
  const conMarcas = raw.replace(/\s{2,}/g, '\x00');
  const partes = conMarcas.split('\x00');
  return partes.map(p => p.replace(/\s/g, '')).filter(Boolean).join(' ');
}

function parseNotario(text) {
  // Normalizar NFC y buscar en el texto completo (zona amplia por si la intro es larga)
  const t = text.normalize('NFC');

  // ── Estrategia 1: anclar en "Ante mi[,] ... Notario [del/de]" ──────────
  // Captura CUALQUIER texto entre esas dos anclas (incluye chars spaceados)
  const anteRe = /[Aa]nte\s+m[íi][,.]?\s*([\s\S]{4,150}?)\s*[,.]?\s*[Nn]otario\s+de/;
  const m1 = t.match(anteRe);
  if (m1) {
    const raw = m1[1];
    const nombre = reconstruirTextoSpaceado(raw);
    const n = toTitleCase(nombre);
    const partes = n.trim().split(/\s+/);
    if (partes.length >= 2 && n.length > 5 && n.length < 80) {
      return { value: n.trim(), confidence: 'high' };
    }
  }

  // ── Estrategia 2: bloque de cabecera "NOTARIO [nombre] C/..." ──────────
  // PDF.js puede unir el cuadro de cabecera con espacios o saltos de línea.
  // La dirección empieza con C/, CALLE, Nº, número o un teléfono → es el límite.
  const headerRe = /NOTARIO\s+([\s\S]{4,100}?)\s*(?:C\/|CALLE\b|PLAZA\b|AVDA|Nº\s*\d|TEL|FAX|Telef|\d{9}|\d{5})/i;
  const m2 = t.match(headerRe);
  if (m2) {
    const nombre = reconstruirTextoSpaceado(m2[1]);
    const n = toTitleCase(nombre.trim());
    const partes = n.split(/\s+/);
    if (partes.length >= 2 && n.length > 5) {
      return { value: n, confidence: 'high' };
    }
  }

  // ── Estrategia 3: "Ante mi" sin "de" después de "Notario" ───────────────
  const anteRe2 = /[Aa]nte\s+m[íi][,.]?\s*([\s\S]{4,150}?)\s*[,.]?\s*[Nn]otario\b/;
  const m3 = t.match(anteRe2);
  if (m3) {
    const raw = m3[1];
    const nombre = reconstruirTextoSpaceado(raw);
    const n = toTitleCase(nombre);
    const partes = n.trim().split(/\s+/);
    if (partes.length >= 2 && n.length > 5 && n.length < 80) {
      return { value: n.trim(), confidence: 'medium' };
    }
  }

  return { value: null, confidence: 'low' };
}

// ── 3. Fecha ─────────────────────────────────
function parseFecha(text) {
  const meses = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre';
  const pat = new RegExp('(\\d{1,2})\\s+de\\s+(' + meses + ')\\s+de\\s+(\\d{4})', 'i');
  const m = text.match(pat);
  if (m) {
    const valor = m[1] + ' DE ' + m[2].toUpperCase() + ' DE ' + m[3];
    return { value: valor, confidence: 'high' };
  }
  return { value: null, confidence: 'low' };
}

// ── 4. Titulares ──────────────────────────────

// Palabras que nunca forman parte de un nombre propio en escrituras
const PALABRAS_NEGRAS = new Set([
  'notario','notaria','colegio','ilustre','registro','registrador',
  'escritura','compraventa','hipoteca','herencia','donacion',
  'comparecen','intervienen','expone','manifiesta','otorga',
  'siguiente','correspondiente','transmision','informacion',
  'eficiencia','energetica','certificado','impuesto','liquidadora',
  'oficina','ayuntamiento','comunidad','estatutos','momento',
  'formacion','verbal','compradora','vendedora','transmitente',
  'adquirente','representacion','poder','apoderado','administrador',
  'gerente','presidente','consejero','secretario','tesorero',
  'diputacion','provincial','municipal','autonomica','nacional',
  'sociedad','limitada','anonima','cooperativa','fundacion',
]);

function esNombreValido(nombre) {
  const palabras = nombre.trim().split(/\s+/);
  // Debe tener al menos 2 palabras (nombre + apellido)
  if (palabras.length < 2) return false;
  // Cada palabra debe tener al menos 2 letras y empezar en mayúscula
  for (const p of palabras) {
    if (p.length < 2) return false;
    if (!/^[A-ZÁÉÍÓÚÜÑ]/.test(p)) return false;
  }
  // Ninguna palabra puede estar en la lista negra
  for (const p of palabras) {
    if (PALABRAS_NEGRAS.has(p.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))) return false;
  }
  // No debe tener palabras sueltas de conectores jurídicos
  if (/\b(de|la|el|los|las|del|al|con|por|para|ante|sobre|entre)\b/i.test(nombre) && palabras.length < 3) return false;
  // Longitud razonable
  return nombre.length >= 7 && nombre.length <= 60;
}

function parseTitulares(text) {
  const candidatos = new Map(); // nombre → puntuación

  // Patrón 1: "Don/Doña NOMBRE APELLIDO [APELLIDO]" — alta fiabilidad
  const pat1 = /(?:Don|Doña|D\.|Dña\.)\s+([A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+(?:\s+(?:de\s+)?[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+){1,3})/g;
  let m;
  while ((m = pat1.exec(text)) !== null) {
    const n = m[1].trim();
    const ctx = text.substring(m.index, m.index + 150);
    // Excluir si en el contexto cercano aparece "Notario" o "Registrador"
    if (/[Nn]otari[oa]|[Rr]egistradora?|[Cc]olegio/.test(ctx)) continue;
    if (esNombreValido(n)) {
      candidatos.set(n, (candidatos.get(n) || 0) + 3);
    }
  }

  // Patrón 2: nombre tras rol explícito ("parte vendedora: NOMBRE")
  const pat2 = /(?:parte\s+(?:vendedora|compradora|transmitente|adquirente))\s*[:\-–]\s*\n?\s*([A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+(?:\s+[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+){1,3})/gi;
  while ((m = pat2.exec(text)) !== null) {
    const n = m[1].trim();
    if (esNombreValido(n)) {
      candidatos.set(n, (candidatos.get(n) || 0) + 2);
    }
  }

  // Patrón 3: nombre de personas jurídicas (CIF P-/A-/B-)
  const pat3 = /([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑA-Za-záéíóúüñ\s]{10,50}),?\s+(?:con\s+)?(?:C\.?I\.?F\.?|N\.?I\.?F\.?)\s+(?:n[uú]mero\s+)?([A-Z]\d[\d-]+)/gi;
  while ((m = pat3.exec(text)) !== null) {
    const n = m[1].trim().replace(/\s+/g, ' ');
    if (n.length > 5 && n.length < 80) {
      candidatos.set(n, (candidatos.get(n) || 0) + 2);
    }
  }

  // Ordenar por puntuación y tomar los más relevantes (máx. 6)
  const nombres = [...candidatos.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(e => e[0]);

  if (nombres.length > 0) {
    return { value: nombres, confidence: nombres.length <= 4 ? 'high' : 'medium' };
  }
  return { value: null, confidence: 'low' };
}

// ── 5. DNI / NIF / NIE ───────────────────────
function parseDNIs(text) {
  // DNI: 8 dígitos + letra | NIE: X/Y/Z + 7 dígitos + letra
  const patron = /\b([XYZxyz]?\d{7,8}[-–\s]?[A-Za-z])\b/g;
  const matches = allMatches(text, patron, 1)
    .map(d => d.toUpperCase().replace(/[-–\s]/g, ''))
    .filter(d => /^[XYZ]?\d{7,8}[A-Z]$/.test(d));
  return {
    value: matches.length > 0 ? matches : null,
    confidence: matches.length > 0 ? 'high' : 'low'
  };
}

// ── 6. Referencia Catastral ───────────────────
function parseRefCatastral(text) {
  const patterns = [
    // Con etiqueta
    { regex: /(?:referencia catastral|ref\.?\s*catastral|RC)\s*[:\-]?\s*([0-9]{7}[A-Z]{2}[0-9]{4}[A-Z][0-9]{4}[A-Z]{2})/i, group: 1 },
    // Sin etiqueta — 20 chars alfanuméricos compactos
    { regex: /\b([0-9]{7}[A-Z]{2}[0-9]{4}[A-Z][0-9]{4}[A-Z]{2})\b/, group: 1 },
    // Con espacios internos (formato con separación visual)
    { regex: /\b([0-9]{7}\s[A-Z]{2}\s[0-9]{4}[A-Z]\s[0-9]{4}[A-Z]{2})\b/, group: 1 },
  ];
  const { value, raw } = firstMatch(text, patterns);
  const clean = value ? value.replace(/\s/g, '') : null;
  return { value: clean, raw, confidence: clean ? 'high' : 'low' };
}

// ── 7. Superficie ─────────────────────────────
// Diccionario de números escritos en letra (hasta 9999)
const LETRAS_NUM = {
  'un': 1, 'uno': 1, 'una': 1, 'dos': 2, 'tres': 3, 'cuatro': 4, 'cinco': 5,
  'seis': 6, 'siete': 7, 'ocho': 8, 'nueve': 9, 'diez': 10, 'once': 11,
  'doce': 12, 'trece': 13, 'catorce': 14, 'quince': 15, 'dieciséis': 16,
  'dieciseis': 16, 'diecisiete': 17, 'dieciocho': 18, 'diecinueve': 19,
  'veinte': 20, 'veintiuno': 21, 'veintidós': 22, 'veintidos': 22,
  'veintitrés': 23, 'veintitres': 23, 'veinticuatro': 24, 'veinticinco': 25,
  'veintiséis': 26, 'veintiseis': 26, 'veintisiete': 27, 'veintiocho': 28,
  'veintinueve': 29, 'treinta': 30, 'cuarenta': 40, 'cincuenta': 50,
  'sesenta': 60, 'setenta': 70, 'ochenta': 80, 'noventa': 90,
  'cien': 100, 'ciento': 100, 'doscientos': 200, 'doscientas': 200,
  'trescientos': 300, 'trescientas': 300, 'cuatrocientos': 400, 'cuatrocientas': 400,
  'quinientos': 500, 'quinientas': 500, 'seiscientos': 600, 'seiscientas': 600,
  'setecientos': 700, 'setecientas': 700, 'ochocientos': 800, 'ochocientas': 800,
  'novecientos': 900, 'novecientas': 900,
  'mil': 1000, 'dos mil': 2000, 'tres mil': 3000,
};

function letrasANumero(texto) {
  const t = texto.toLowerCase().trim();
  // Intentar con "mil" compuesto
  const milMatch = t.match(/^([\w\s]+)\s+mil(?:\s+([\w\s]+))?$/);
  if (milMatch) {
    const miles = LETRAS_NUM[milMatch[1].trim()] || 0;
    const resto = milMatch[2] ? letrasANumero(milMatch[2]) : 0;
    return miles * 1000 + resto;
  }
  // "y" de enlace: "cincuenta y dos"
  const yMatch = t.match(/^([\w]+)\s+y\s+([\w]+)$/);
  if (yMatch) {
    const a = LETRAS_NUM[yMatch[1]] || 0;
    const b = LETRAS_NUM[yMatch[2]] || 0;
    return a + b;
  }
  return LETRAS_NUM[t] || null;
}

function parseSuperficie(text) {
  // Normalizar: unir líneas cortas (artefactos OCR) y quitar guiones de relleno
  const clean = text.replace(/[-–]{3,}/g, ' ').replace(/\s+/g, ' ');

  // 1. Numérica directa: "92,50 metros cuadrados" o "92 m²"
  // Requiere al menos 2 dígitos O que vaya precedido de contexto de finca
  const numPat = /(\d{2,6}(?:[.,]\d{1,2})?)\s*(?:metros?\s*cuadrados?|m[²2])/i;
  const m1 = clean.match(numPat);
  if (m1) {
    const num = parseFloat(m1[1].replace(',', '.'));
    // Umbral de cordura: entre 8 y 500.000 m²
    if (num >= 8 && num < 500000) {
      return { value: num + ' m²', numerico: num, confidence: 'high' };
    }
  }

  // 2. Letras en minúsculas o mayúsculas: "noventa y dos metros cuadrados"
  //    o "NOVENTA Y DOS METROS CUADRADOS"
  const textLow = clean.toLowerCase();
  const letrasPat = /((?:[a-záéíóúüñ]+\s+){1,10})metros?\s*cuadrados?/gi;
  let m2;
  while ((m2 = letrasPat.exec(textLow)) !== null) {
    const candidato = m2[1].trim();
    const num = letrasANumero(candidato);
    if (num && num >= 8 && num < 100000) {
      return { value: num + ' m²', numerico: num, confidence: 'medium' };
    }
    // Intentar con la última parte si hay conectores tipo "con X metros"
    const partes = candidato.split(/\s+con\s+|\s+y\s+/);
    for (const p of partes.reverse()) {
      const n2 = letrasANumero(p.trim());
      if (n2 && n2 >= 8 && n2 < 100000) {
        return { value: n2 + ' m²', numerico: n2, confidence: 'low' };
      }
    }
  }

  // 3. Etiqueta explícita: "Superficie total: 90 m²"
  const catPat = /superficie[^:.\n]{0,20}[:\s]\s*(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:m[²2]|metros?)/i;
  const m3 = clean.match(catPat);
  if (m3) {
    const num = parseFloat(m3[1].replace(',', '.'));
    return { value: num + ' m²', numerico: num, confidence: 'medium' };
  }

  return { value: null, numerico: null, confidence: 'low' };
}

// ── 8. Linderos ───────────────────────────────
function parseLinderos(text) {
  // Busca "LINDA:" o "LINDEROS:" y extrae hasta el siguiente bloque doble
  const m = text.match(/(?:LINDA(?:RES)?|LINDES)\s*[:\-]?\s*([\s\S]{20,600}?)(?:\n{2,}|SUPERFICIE|CUOTA|CARGAS|PRECIO|VALOR)/i);
  if (m) {
    return { value: m[1].replace(/\s+/g, ' ').trim(), confidence: 'medium' };
  }
  return { value: null, confidence: 'low' };
}

// ── 9. Precio ─────────────────────────────────
function parsePrecio(text) {
  const patterns = [
    { regex: /precio[^.]{0,40}?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*(?:euros?|€)/i, group: 1 },
    { regex: /por\s+(?:la\s+suma\s+de|precio\s+de)[^.]{0,30}?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*(?:euros?|€)/i, group: 1 },
    { regex: /(\d{1,3}(?:\.\d{3})+(?:,\d{2})?)\s*(?:euros?|€)/i, group: 1 },
  ];
  const { value, raw } = firstMatch(text, patterns);
  if (!value) return { value: null, confidence: 'low' };
  const num = parseFloat(value.replace(/\./g, '').replace(',', '.'));
  const formatted = num.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
  return { value: formatted, numerico: num, raw, confidence: 'medium' };
}

// ── 10. Cargas ────────────────────────────────
function parseCargas(text) {
  const u = normalizar(text);
  if (/LIBRE DE CARGAS|LIBRE DE TODA CARGA|SIN CARGA/.test(u)) {
    return { value: ['Libre de cargas'], confidence: 'high' };
  }
  const cargas = [];
  if (/HIPOTECA|PRESTAMO HIPOTECARIO/.test(u)) cargas.push('Hipoteca');
  if (/EMBARGO|ANOTACION PREVENTIVA/.test(u))  cargas.push('Embargo / Anotación preventiva');
  if (/SERVIDUMBRE/.test(u))                   cargas.push('Servidumbre');
  if (/USUFRUCTO/.test(u))                     cargas.push('Usufructo');
  if (/CONDICION RESOLUTORIA/.test(u))         cargas.push('Condición resolutoria');
  return {
    value: cargas.length > 0 ? cargas : null,
    confidence: cargas.length > 0 ? 'medium' : 'low'
  };
}

// ── Función principal ─────────────────────────
export function parseEscritura(rawText) {
  if (!rawText || rawText.trim().length < 50) {
    return { error: 'Texto insuficiente para analizar' };
  }

  const resultado = {
    tipoOperacion: parseTipoOperacion(rawText),
    notario:       parseNotario(rawText),
    fecha:         parseFecha(rawText),
    titulares:     parseTitulares(rawText),
    documentos:    parseDNIs(rawText),
    refCatastral:  parseRefCatastral(rawText),
    superficie:    parseSuperficie(rawText),
    linderos:      parseLinderos(rawText),
    precio:        parsePrecio(rawText),
    cargas:        parseCargas(rawText),
    _meta: {
      longitudTexto: rawText.length,
      timestamp: new Date().toISOString(),
    }
  };

  const puntos = Object.values(resultado)
    .filter(f => f && f.confidence)
    .map(f => ({ high: 3, medium: 2, low: 1 }[f.confidence] || 0));
  const media = puntos.reduce((a, b) => a + b, 0) / (puntos.length || 1);
  resultado._meta.confianzaGlobal = media >= 2.5 ? 'high' : media >= 1.8 ? 'medium' : 'low';

  return resultado;
}

export function compararConRegistro(escritura, registro) {
  const disc = [];
  if (escritura.superficie?.numerico && registro.superficie) {
    const pct = Math.abs(escritura.superficie.numerico - registro.superficie) / registro.superficie * 100;
    if (pct > 1) disc.push({
      campo: 'Superficie',
      escritura: escritura.superficie.value,
      registro: registro.superficie + ' m²',
      tipo: pct > 10 ? 'error' : 'aviso',
      detalle: 'Diferencia del ' + pct.toFixed(1) + '%'
    });
  }
  if (escritura.refCatastral?.value && registro.refCatastral) {
    if (escritura.refCatastral.value !== registro.refCatastral) {
      disc.push({
        campo: 'Referencia catastral',
        escritura: escritura.refCatastral.value,
        registro: registro.refCatastral,
        tipo: 'error',
        detalle: 'Las referencias no coinciden'
      });
    }
  }
  return disc;
}
