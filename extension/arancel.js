// ─────────────────────────────────────────────────────────────
// arancel.js — Cálculo de aranceles del Registro de la Propiedad
// Basado en el RD 1427/1989 (Arancel de los Registradores de la
// Propiedad), escala progresiva Número 2 (Inscripciones).
// ─────────────────────────────────────────────────────────────

// ── Escala Nº 2 (tramos por encima de los 6.010,12 € base) ───
const TRAMOS = [
  { desde: 6010.12,    hasta: 30050.61,  porMil: 1.75 },
  { desde: 30050.61,   hasta: 60101.21,  porMil: 1.25 },
  { desde: 60101.21,   hasta: 150253.03, porMil: 0.75 },
  { desde: 150253.03,  hasta: 601012.10, porMil: 0.30 },
  { desde: 601012.10,  hasta: Infinity,  porMil: 0.20 },
];

const MIN_HONOR = 24.04;   // mínimo legal (primer tramo fijo)
const MAX_HONOR = 2181.67; // máximo legal

// ── Cálculo interno (escala progresiva) ──────────────────────
function calcularEscala(valor) {
  if (!valor || valor <= 0) return MIN_HONOR;
  let honor = MIN_HONOR; // base fija del primer tramo
  for (const t of TRAMOS) {
    if (valor <= t.desde) break;
    honor += (Math.min(valor, t.hasta) - t.desde) * t.porMil / 1000;
  }
  return +(Math.min(Math.max(honor, MIN_HONOR), MAX_HONOR).toFixed(2));
}

// ── Descripción del concepto según tipo de operación ─────────
function nombreConcepto(tipo) {
  const t = (tipo || '').toLowerCase();
  if (t.includes('compraventa') || t.includes('compra'))  return 'Inscripción de compraventa';
  if (t.includes('hipoteca'))                             return 'Inscripción de hipoteca';
  if (t.includes('cancelac'))                             return 'Cancelación de hipoteca';
  if (t.includes('herencia') || t.includes('sucesión'))   return 'Inscripción de herencia';
  if (t.includes('donación') || t.includes('donacion'))   return 'Inscripción de donación';
  if (t.includes('agrupac') || t.includes('división') ||
      t.includes('division') || t.includes('segregac'))   return 'Agrupación / División de finca';
  if (t.includes('permuta'))                              return 'Inscripción de permuta';
  return 'Inscripción registral';
}

/**
 * Calcula el desglose completo de honorarios para una operación.
 *
 * @param {number} valor  - Base para el cálculo (precio escriturado,
 *                          responsabilidad hipotecaria, valor catastral…)
 * @param {string} tipo   - Tipo de operación (compraventa, hipoteca, etc.)
 * @param {Array}  extra  - Líneas adicionales [{concepto, honor, norma}]
 * @returns {{ lineas, subtotal, iva, total }}
 */
export function calcularHonorarios(valor, tipo, extra = []) {
  const lineas = [];
  const esCancelacion = (tipo || '').toLowerCase().includes('cancelac');

  // Honorarios de inscripción (50 % en cancelaciones, art. 2.5 RD 1427/89)
  const baseHonor = calcularEscala(valor);
  const honor     = esCancelacion ? +(baseHonor * 0.5).toFixed(2) : baseHonor;

  lineas.push({
    concepto: nombreConcepto(tipo),
    base:     valor,
    honor,
    norma:    'Art. 2 Arancel – RD 1427/1989',
  });

  // Asiento de presentación (siempre incluido)
  lineas.push({
    concepto: 'Asiento de presentación',
    base:     null,
    honor:    9.02,
    norma:    'Art. 1 Arancel – RD 1427/1989',
  });

  // Conceptos adicionales opcionales
  for (const e of extra) lineas.push(e);

  const subtotal = +(lineas.reduce((s, l) => s + l.honor, 0).toFixed(2));
  const iva      = +(subtotal * 0.21).toFixed(2);
  const total    = +(subtotal + iva).toFixed(2);

  return { lineas, subtotal, iva, total };
}

/**
 * Devuelve el desglose por tramos (para mostrar en la UI).
 */
export function desgloseTramos(valor) {
  if (!valor || valor <= 0) return [];
  const result = [];

  result.push({
    rango:   'Hasta 6.010,12 €',
    porMil:  '—',
    porcion: Math.min(valor, 6010.12),
    honor:   MIN_HONOR,
  });

  for (const t of TRAMOS) {
    if (valor <= t.desde) break;
    const porcion = +(Math.min(valor, t.hasta) - t.desde).toFixed(2);
    const honor   = +(porcion * t.porMil / 1000).toFixed(2);
    const fmtNum  = (n) => n.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €';
    const hasta   = t.hasta === Infinity ? 'en adelante' : fmtNum(t.hasta);
    result.push({
      rango:   `De ${fmtNum(t.desde)} a ${hasta}`,
      porMil:  t.porMil,
      porcion,
      honor,
    });
  }

  return result;
}
