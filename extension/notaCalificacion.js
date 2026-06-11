// ─────────────────────────────────────────────────────────────
// notaCalificacion.js — Generador de borrador de nota de calificación
// Produce el texto formal con los datos extraídos del parser y
// los defectos detectados por la calificación asistida.
// El registrador solo necesita rellenar los huecos marcados con [___].
// ─────────────────────────────────────────────────────────────

const HOY = new Date().toLocaleDateString('es-ES', {
  day: 'numeric', month: 'long', year: 'numeric'
});

// Mapa de defectos → fundamento jurídico
const FUNDAMENTOS = {
  'Falta referencia catastral':
    'art. 43 del Texto Refundido de la Ley del Catastro Inmobiliario y art. 9 LH, en la redacción dada por la Ley 13/2015',
  'Precio de transmisión no declarado':
    'art. 1.445 del Código Civil y art. 254.3 LH (necesidad de consignar el precio en transmisiones)',
  'NIF/DNI no detectados':
    'art. 254 LH y RD 1.065/2007, de 27 de julio (obligatoriedad de identificación fiscal en transmisiones)',
  'Posible exceso de cabida':
    'art. 201 LH (expediente de rectificación de superficie) y Resolución DGRN',
  'Diferencia de superficie con Catastro':
    'art. 9.b) LH y art. 199 LH (coordinación con Catastro)',
  'Cargas o gravámenes detectados':
    'art. 175.2 RH (necesidad de previa cancelación o cancelación simultánea)',
  'Notario no identificado':
    'art. 18 LH (identificación del fedatario autorizante)',
};

function fundamento(titulo) {
  for (var k in FUNDAMENTOS) {
    if (titulo.includes(k.split(' ')[0]) && titulo.includes(k.split(' ')[1] || '')) {
      return FUNDAMENTOS[k];
    }
  }
  return '[indicar fundamento jurídico]';
}

export function generarBorrador(analisis, checks, obsRegistrador) {
  const tipo   = analisis.tipoOperacion?.value  || '[tipo de operación]';
  const fecha  = analisis.fecha?.value           || '[fecha]';
  const notario = analisis.notario?.value        || '[notario]';
  const rc     = analisis.refCatastral?.value    || '[referencia catastral]';
  const sup    = analisis.superficie?.value      || '[superficie]';
  const lind   = analisis.linderos?.value        || '[linderos]';
  const precio = analisis.precio?.value          || '';
  const cargas = analisis.cargas?.value?.join(', ') || 'no determinadas';

  // Separar defectos por tipo
  const rojos    = checks.filter(c => c.nivel === 'rojo');
  const naranjas = checks.filter(c => c.nivel === 'naranja');

  // Descripción de la finca
  var descFinca = '  Finca con referencia catastral ' + rc + '.';
  if (sup !== '[superficie]') descFinca += ' Superficie: ' + sup + '.';
  if (lind !== '[linderos]')  descFinca += ' Linderos: ' + lind.slice(0, 200) + (lind.length > 200 ? '…' : '') + '.';

  // Bloque de calificación
  var bloqueCalif = '';

  if (rojos.length === 0 && naranjas.length === 0) {
    bloqueCalif =
      'Practicada la calificación del documento presentado, se acuerda proceder\n' +
      'a la inscripción del mismo, al no apreciarse defecto que la impida.\n';
  } else {
    var hayInsubsanables = rojos.length > 0;
    var verbo = hayInsubsanables ? 'DENIEGA' : 'SUSPENDE';

    bloqueCalif =
      'Practicada la calificación del documento presentado, se ' + verbo + ' la\n' +
      'inscripción del mismo, por los siguientes defectos:\n';

    if (rojos.length > 0) {
      bloqueCalif += '\nDEFECTOS INSUBSANABLES:\n';
      rojos.forEach(function (c, i) {
        bloqueCalif += '\n  ' + (i + 1) + '.º ' + c.titulo + '.\n';
        if (c.detalle) bloqueCalif += '     ' + c.detalle + '\n';
        bloqueCalif += '     Fundamento: ' + fundamento(c.titulo) + '.\n';
      });
    }

    if (naranjas.length > 0) {
      bloqueCalif += '\nDEFECTOS SUBSANABLES:\n';
      naranjas.forEach(function (c, i) {
        bloqueCalif += '\n  ' + (i + 1) + '.º ' + c.titulo + '.\n';
        if (c.detalle) bloqueCalif += '     ' + c.detalle + '\n';
        bloqueCalif += '     Fundamento: ' + fundamento(c.titulo) + '.\n';
      });
    }

    bloqueCalif +=
      '\nContra la presente calificación negativa cabe interponer recurso\n' +
      'ante la Dirección General de Seguridad Jurídica y Fe Pública en el\n' +
      'plazo de un mes desde la notificación (art. 324 LH), o solicitar\n' +
      'calificación sustitutoria (art. 19 bis LH).\n';
  }

  // Bloque precio (solo en compraventa)
  var bloquePrecio = '';
  if (tipo === 'compraventa' && precio) {
    bloquePrecio = '\nPrecio declarado: ' + precio + '.\n';
  }

  // Notas del registrador
  var bloqueObs = obsRegistrador && obsRegistrador.trim()
    ? '\nOBSERVACIONES DEL REGISTRADOR:\n' + obsRegistrador.trim() + '\n'
    : '';

  // ── Texto completo ──────────────────────────────────────────
  return [
    '═══════════════════════════════════════════════════════════',
    'REGISTRO DE LA PROPIEDAD N.º [___] DE [localidad]',
    '',
    '                    NOTA DE CALIFICACIÓN',
    '═══════════════════════════════════════════════════════════',
    '',
    'ASIENTO DE PRESENTACIÓN:',
    '  Asiento [___] del Diario [___], de fecha [___].',
    '',
    'DOCUMENTO CALIFICADO:',
    '  ' + tipo.charAt(0).toUpperCase() + tipo.slice(1) +
    ' otorgada el día ' + fecha +
    ' ante el Notario ' + notario +
    ', con número de protocolo [___].',
    bloquePrecio,
    'DESCRIPCIÓN DE LA FINCA:',
    descFinca,
    '  Cargas: ' + cargas + '.',
    '',
    '─────────────────────────────────────────────────────────',
    'CALIFICACIÓN:',
    '─────────────────────────────────────────────────────────',
    '',
    bloqueCalif,
    bloqueObs,
    '─────────────────────────────────────────────────────────',
    'En [localidad], a ' + HOY + '.',
    '',
    'EL/LA REGISTRADOR/A DE LA PROPIEDAD',
    '',
    '[Firma]',
    '',
    '[Nombre y apellidos]',
    '═══════════════════════════════════════════════════════════',
    '',
    '* Borrador generado automáticamente por Registro Asistente.',
    '* Revisar y completar los campos marcados con [___] antes de notificar.',
  ].join('\n');
}
