// ─────────────────────────────────────────────────────────────
// plazos.js — Gestión de plazos registrales
// Calcula fechas límite a partir de la fecha de presentación.
// Todo 100% local, sin acceso a sistemas externos.
// ─────────────────────────────────────────────────────────────

// Añade días naturales a una fecha
function addDias(fecha, dias) {
  var d = new Date(fecha);
  d.setDate(d.getDate() + dias);
  return d;
}

// Añade días HÁBILES (excluye sábados y domingos)
// Para rigor completo habría que incluir festivos nacionales,
// pero sin acceso a calendarios externos usamos solo fines de semana.
function addDiasHabiles(fecha, habiles) {
  var d = new Date(fecha);
  var count = 0;
  while (count < habiles) {
    d.setDate(d.getDate() + 1);
    var dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++; // 0=domingo, 6=sábado
  }
  return d;
}

// Añade meses naturales
function addMeses(fecha, meses) {
  var d = new Date(fecha);
  d.setMonth(d.getMonth() + meses);
  return d;
}

// Diferencia en días entre hoy y una fecha límite
function diasRestantes(limite) {
  var hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  var lim = new Date(limite);
  lim.setHours(0, 0, 0, 0);
  return Math.round((lim - hoy) / 86400000);
}

function formatFecha(d) {
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Documentación complementaria por tipo de operación
const DOC_COMPLEMENTARIA = {
  compraventa: [
    { doc: 'Nota simple informativa reciente (< 3 meses)', obligatorio: true },
    { doc: 'Certificado de eficiencia energética', obligatorio: true },
    { doc: 'Justificante pago / exención plusvalía municipal (IIVTNU)', obligatorio: true },
    { doc: 'Último recibo IBI', obligatorio: false },
    { doc: 'Certificado deudas comunidad de propietarios (si aplica)', obligatorio: false },
    { doc: 'Cédula de habitabilidad (si exige la CCAA)', obligatorio: false },
    { doc: 'Liquidación ITPAJD o acreditación exención / IVA', obligatorio: true },
  ],
  hipoteca: [
    { doc: 'Tasación homologada del inmueble', obligatorio: true },
    { doc: 'FEIN (Ficha Europea de Información Normalizada)', obligatorio: true },
    { doc: 'FIAE (Ficha de Advertencias Estandarizadas)', obligatorio: true },
    { doc: 'Acta notarial de transparencia material (art. 15 Ley 5/2019)', obligatorio: true },
    { doc: 'Simulación de cuotas / TAE', obligatorio: false },
    { doc: 'Seguro de vida / hogar (si vinculado)', obligatorio: false },
    { doc: 'Liquidación AJD o acreditación exención', obligatorio: true },
  ],
  herencia: [
    { doc: 'Certificado de defunción', obligatorio: true },
    { doc: 'Certificado del Registro de Últimas Voluntades', obligatorio: true },
    { doc: 'Testamento o declaración de herederos abintestato', obligatorio: true },
    { doc: 'Liquidación Impuesto de Sucesiones (mod. 650/651)', obligatorio: true },
    { doc: 'Nota simple de la finca', obligatorio: false },
    { doc: 'Inventario de bienes valorado', obligatorio: false },
  ],
  donacion: [
    { doc: 'NIF del donante y donatario', obligatorio: true },
    { doc: 'Liquidación Impuesto de Donaciones (mod. 651)', obligatorio: true },
    { doc: 'Nota simple de la finca', obligatorio: false },
    { doc: 'Justificante plusvalía municipal si hay transmisión de urbana', obligatorio: false },
  ],
  cancelacion: [
    { doc: 'Carta de pago / certificado de cancelación del acreedor', obligatorio: true },
    { doc: 'Poder del representante de la entidad (si aplica)', obligatorio: false },
    { doc: 'Liquidación AJD (actos jurídicos documentados)', obligatorio: true },
  ],
  agrupacion: [
    { doc: 'Licencia municipal de agrupación o declaración de innecesariedad', obligatorio: true },
    { doc: 'Certificado técnico de descripción de la finca resultante', obligatorio: false },
    { doc: 'Representación gráfica georreferenciada (si exige Catastro)', obligatorio: false },
  ],
  division: [
    { doc: 'Licencia de división horizontal o declaración de innecesariedad', obligatorio: true },
    { doc: 'Memoria de calidades / proyecto técnico', obligatorio: false },
    { doc: 'Certificado final de obra (si obra nueva)', obligatorio: false },
    { doc: 'Seguro decenal (si vivienda de nueva construcción)', obligatorio: false },
  ],
  permuta: [
    { doc: 'NIF de ambas partes', obligatorio: true },
    { doc: 'Liquidación ITPAJD por cada bien permutado', obligatorio: true },
    { doc: 'Nota simple de ambas fincas', obligatorio: false },
  ],
};

export function calcularPlazos(fechaPresentacion) {
  var fp = new Date(fechaPresentacion);

  return {
    asientoVence:       { label: 'Asiento de presentación vence',      fecha: addDias(fp, 60),      base: 'art. 17 LH',    critico: true },
    plazoCalificacion:  { label: 'Plazo de calificación (15 h.)',       fecha: addDiasHabiles(fp,15), base: 'art. 18 LH',    critico: true },
    asientoProrrogado:  { label: 'Prórroga máx. asiento (si se pide)',  fecha: addDias(fp, 120),     base: 'art. 96 RH',    critico: false },
  };
}

export function calcularPlazosDefecto(fechaNotificacion) {
  var fn = new Date(fechaNotificacion);
  return {
    subsanacion: { label: 'Plazo subsanación defectos',    fecha: addDias(fn, 60),   base: 'art. 19 bis LH', critico: true },
    recurso:     { label: 'Plazo recurso DGSJFP',          fecha: addMeses(fn, 1),   base: 'art. 324 LH',    critico: true },
    calSustitut: { label: 'Calificación sustitutoria',     fecha: addDias(fn, 15),   base: 'art. 19 bis LH', critico: false },
  };
}

export function getDocumentacionComplementaria(tipoOperacion) {
  return DOC_COMPLEMENTARIA[tipoOperacion] || [];
}

export { diasRestantes, formatFecha };
