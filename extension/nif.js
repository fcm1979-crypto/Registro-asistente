// ─────────────────────────────────────────────────────────────
// nif.js — Validador de NIF / NIE / CIF (v0.3.3)
// Implementa el algoritmo oficial del Ministerio del Interior.
// 100% local: no sale ningún dato de la extensión.
//
// Uso:
//   import { validarIdentificador, validarLista } from './nif.js';
//   validarIdentificador('12345678Z')
//   // → { valido: true, tipo: 'NIF', msg: 'NIF correcto' }
// ─────────────────────────────────────────────────────────────

const LETRAS_CONTROL = 'TRWAGMYFPDXBNJZSQVHLCKE';

// ── NIF (DNI español) ─────────────────────────────────────────
export function validarNIF(raw) {
  const s = raw.trim().toUpperCase().replace(/[-.\s]/g, '');
  if (!/^\d{8}[A-Z]$/.test(s))
    return { valido: false, tipo: 'NIF', msg: 'Formato incorrecto (8 dígitos + letra)' };
  const esperada = LETRAS_CONTROL[parseInt(s.slice(0, 8), 10) % 23];
  if (s[8] !== esperada)
    return { valido: false, tipo: 'NIF', msg: `Letra de control errónea — debería ser "${esperada}"` };
  return { valido: true, tipo: 'NIF', msg: 'NIF correcto' };
}

// ── NIE ───────────────────────────────────────────────────────
export function validarNIE(raw) {
  const s = raw.trim().toUpperCase().replace(/[-.\s]/g, '');
  if (!/^[XYZ]\d{7}[A-Z]$/.test(s))
    return { valido: false, tipo: 'NIE', msg: 'Formato incorrecto (X/Y/Z + 7 dígitos + letra)' };
  const map = { X: '0', Y: '1', Z: '2' };
  const num  = parseInt(map[s[0]] + s.slice(1, 8), 10);
  const esperada = LETRAS_CONTROL[num % 23];
  if (s[8] !== esperada)
    return { valido: false, tipo: 'NIE', msg: `Letra de control errónea — debería ser "${esperada}"` };
  return { valido: true, tipo: 'NIE', msg: 'NIE correcto' };
}

// ── CIF ───────────────────────────────────────────────────────
export function validarCIF(raw) {
  const s = raw.trim().toUpperCase().replace(/[-.\s]/g, '');
  if (!/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(s))
    return { valido: false, tipo: 'CIF', msg: 'Formato incorrecto (letra + 7 dígitos + dígito/letra control)' };

  const tipo   = s[0];
  const digits = s.slice(1, 8);
  const ctrl   = s[8];

  // Suma Luhn-like: posición impar (índice par) → dígito×2 con reducción;
  // posición par (índice impar) → dígito directo.
  let sumaImpar = 0, sumaPar = 0;
  for (let i = 0; i < 7; i++) {
    const d = parseInt(digits[i], 10);
    if (i % 2 === 0) {
      let x = d * 2;
      sumaImpar += x >= 10 ? Math.floor(x / 10) + (x % 10) : x;
    } else {
      sumaPar += d;
    }
  }
  const total       = (sumaImpar + sumaPar) % 10;
  const digitoCtrl  = total === 0 ? 0 : 10 - total;
  const letraCtrl   = 'JABCDEFGHI'[digitoCtrl];

  // Tipos que solo admiten letra: K, N, P, Q, S, W
  const soloLetra  = 'KNPQSW'.includes(tipo);
  // Tipos que solo admiten dígito: A, B, E, H
  const soloDigito = 'ABEH'.includes(tipo);

  const esperado = soloLetra  ? letraCtrl
                 : soloDigito ? String(digitoCtrl)
                 : `${letraCtrl} o ${digitoCtrl}`;
  const esValido = soloLetra  ? ctrl === letraCtrl
                 : soloDigito ? ctrl === String(digitoCtrl)
                 : (ctrl === letraCtrl || ctrl === String(digitoCtrl));

  if (!esValido)
    return { valido: false, tipo: 'CIF', msg: `Dígito de control erróneo — debería ser "${esperado}"` };
  return { valido: true, tipo: 'CIF', msg: 'CIF correcto' };
}

// ── Función unificada (detecta tipo automáticamente) ──────────
/**
 * @param {string} id — NIF, NIE o CIF en cualquier formato
 * @returns {{ valido: boolean, tipo: string|null, msg: string }}
 */
export function validarIdentificador(id) {
  const s = (id || '').trim().toUpperCase().replace(/[-.\s]/g, '');
  if (!s) return { valido: false, tipo: null, msg: 'Campo vacío' };

  if (/^[XYZ]/.test(s))  return validarNIE(s);
  if (/^\d/.test(s))      return validarNIF(s);
  if (/^[A-W]/.test(s))  return validarCIF(s);

  return { valido: false, tipo: null, msg: 'Prefijo no reconocido' };
}

/**
 * Valida una lista de identificadores (separados por coma, ;, espacio o salto).
 * @param {string} texto
 * @returns {Array<{ id: string, valido: boolean, tipo: string|null, msg: string }>}
 */
export function validarLista(texto) {
  return (texto || '')
    .split(/[,;\n\s]+/)
    .map(t => t.trim())
    .filter(Boolean)
    .map(id => ({ id, ...validarIdentificador(id) }));
}

/**
 * Extrae y valida todos los posibles NIF/NIE/CIF de un bloque de texto.
 * Útil para pasarle el texto de la escritura y detectar errores de captura.
 * @param {string} texto
 * @returns {Array<{ id: string, valido: boolean, tipo: string|null, msg: string }>}
 */
export function detectarEnTexto(texto) {
  if (!texto) return [];
  // Captura patrones del tipo: 12345678A, X1234567A, B12345678, etc.
  const RE = /\b([XYZxyz]?\d{7,8}[A-Za-z]|[A-Wa-w]\d{7}[0-9A-Ja-j])\b/g;
  const encontrados = [];
  let m;
  while ((m = RE.exec(texto)) !== null) {
    const id = m[1].toUpperCase();
    if (!encontrados.some(e => e.id === id)) {
      encontrados.push({ id, ...validarIdentificador(id) });
    }
  }
  return encontrados;
}
