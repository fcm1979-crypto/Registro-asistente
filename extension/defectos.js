// ─────────────────────────────────────────────────────────────
// defectos.js — Biblioteca de defectos tipificados de calificación
// v0.3.3 · 100% local, sin envío de datos.
//
// Base normativa: LH (Ley Hipotecaria), RH (Reglamento Hipotecario),
// CC (Código Civil), TRLS 2015, LIRNR, doctrina DGSJFP/DGRN.
//
// Uso:
//   import { DEFECTOS, CATEGORIAS, buscarDefectos } from './defectos.js';
// ─────────────────────────────────────────────────────────────

/** @type {Array<{id,cat,titulo,fundamento,suspende,texto}>} */
export const DEFECTOS = [

  // ── TRACTO SUCESIVO ─────────────────────────────────────────
  {
    id: 'tracto-01', cat: 'tracto', suspende: true,
    titulo: 'Falta de tracto sucesivo',
    fundamento: 'Art. 20 LH',
    texto: `DEFECTO SUSPENSIVO — FALTA DE TRACTO SUCESIVO (art. 20 LH)

El transmitente que figura en el título calificado no coincide con el titular registral de la finca, por lo que no se cumple el principio de tracto sucesivo que impone el art. 20 de la Ley Hipotecaria.

Para subsanar este defecto deberá aportarse: (a) escritura o título público que acredite la adquisición previa del transmitente e instarse su inscripción con carácter previo, o (b) iniciarse el expediente de reanudación del tracto sucesivo interrumpido ante notario conforme al art. 208 LH.`,
  },
  {
    id: 'tracto-02', cat: 'tracto', suspende: true,
    titulo: 'Heredero no inscrito dispone de bien hereditario',
    fundamento: 'Arts. 14 y 20 LH',
    texto: `DEFECTO SUSPENSIVO — TRACTO SUCESIVO: HEREDERO SIN INSCRIPCIÓN PREVIA (arts. 14 y 20 LH)

El causante figura como titular registral, pero el heredero/legatario que otorga el título presentado no ha inscrito previamente su adquisición mortis causa. Conforme al art. 20 LH no puede practicarse la inscripción sin que conste previamente inscrito el derecho del disponente.

Deberá aportarse escritura de aceptación y adjudicación de herencia para su previa inscripción o bien acreditar que se trata de legado de cosa específica sometido al art. 81 RH.`,
  },

  // ── IDENTIFICACIÓN / NIF ─────────────────────────────────────
  {
    id: 'nif-01', cat: 'nif', suspende: true,
    titulo: 'Omisión del NIF/NIE del adquirente',
    fundamento: 'Art. 254.2 LH · Arts. 17 bis y 23 LN',
    texto: `DEFECTO SUSPENSIVO — OMISIÓN DEL NIF/NIE DEL ADQUIRENTE (art. 254.2 LH)

El título presentado no contiene el número de identificación fiscal del adquirente, circunstancia exigida por el art. 254.2 de la Ley Hipotecaria y por el art. 23 de la Ley del Notariado (en la redacción dada por la Ley 36/2006, de medidas para la prevención del fraude fiscal).

El Registro no practicará la inscripción hasta que se subsane este defecto mediante acta notarial complementaria o diligencia adicional en la que conste el NIF/NIE del interesado.`,
  },
  {
    id: 'nif-02', cat: 'nif', suspende: true,
    titulo: 'NIF de la entidad vendedora no acreditado',
    fundamento: 'Art. 254.2 LH · Ley 36/2006',
    texto: `DEFECTO SUSPENSIVO — OMISIÓN DEL CIF DE LA ENTIDAD TRANSMITENTE (art. 254.2 LH)

El título no recoge el número de identificación fiscal (CIF) de la entidad persona jurídica que actúa como transmitente, requisito impuesto por el art. 254.2 LH para la práctica de cualquier asiento de inscripción en el Registro de la Propiedad.

Deberá subsanarse mediante diligencia notarial o acta complementaria que haga constar el CIF de la entidad.`,
  },
  {
    id: 'nif-03', cat: 'nif', suspende: false,
    titulo: 'NIF del transmitente difiere del registral',
    fundamento: 'Arts. 9 LH · 51.9.ª RH',
    texto: `DEFECTO A SUBSANAR — NIF DEL TRANSMITENTE NO COINCIDE CON EL ASIENTO REGISTRAL

El número de identificación fiscal que consta en el título presentado para el transmitente difiere del que figura en el asiento registral vigente. Antes de practicar la inscripción debe aclararse si se trata de un error material —en cuyo caso bastará diligencia notarial de rectificación— o de identidades distintas, lo que impediría la calificación favorable.`,
  },

  // ── CAPACIDAD Y REPRESENTACIÓN ───────────────────────────────
  {
    id: 'cap-01', cat: 'capacidad', suspende: true,
    titulo: 'Insuficiencia de poder de representación',
    fundamento: 'Arts. 18 LH · 98 Ley 24/2001',
    texto: `DEFECTO SUSPENSIVO — INSUFICIENCIA DE PODER DE REPRESENTACIÓN (art. 98 Ley 24/2001; art. 18 LH)

El representante actúa en virtud de poder cuyo alcance, conforme al juicio notarial de suficiencia, no cubre el acto dispositivo otorgado; o bien el poder aportado ha caducado o ha sido revocado con anterioridad a la fecha de otorgamiento de la escritura.

Para subsanar el defecto deberá aportarse poder bastante en vigor para el acto concreto o ratificación expresa del representado en escritura pública.`,
  },
  {
    id: 'cap-02', cat: 'capacidad', suspende: true,
    titulo: 'Acto de disposición sobre bienes de menor de edad sin autorización judicial',
    fundamento: 'Art. 166 CC',
    texto: `DEFECTO SUSPENSIVO — DISPOSICIÓN SOBRE BIENES DE MENOR SIN AUTORIZACIÓN JUDICIAL (art. 166 CC)

El acto de disposición que contiene el título afecta a bienes de un menor de edad no emancipado. Conforme al art. 166 del Código Civil, los titulares de la patria potestad necesitan autorización judicial previa para realizar actos de disposición a título oneroso sobre bienes inmuebles de los hijos sujetos a ella.

Deberá aportarse el auto judicial de autorización, firme o con las garantías exigidas por el Juzgado.`,
  },
  {
    id: 'cap-03', cat: 'capacidad', suspende: true,
    titulo: 'Persona jurídica: acuerdo social insuficiente',
    fundamento: 'Arts. 160 y 234 LSC',
    texto: `DEFECTO SUSPENSIVO — ACUERDO SOCIAL INSUFICIENTE PARA EL ACTO DE DISPOSICIÓN

El acto de disposición o gravamen de inmuebles por la entidad mercantil requiere, conforme a los estatutos o a la Ley de Sociedades de Capital (arts. 160 y ss. LSC), acuerdo de la Junta General o del Consejo de Administración con el quórum y mayoría exigidos.

El título no acredita la adopción del acuerdo social necesario o la delegación de facultades suficiente en el administrador otorgante. Deberá completarse con certificación del órgano social correspondiente o escritura de elevación a público del acuerdo.`,
  },

  // ── IMPUESTO / LIQUIDACIÓN ───────────────────────────────────
  {
    id: 'imp-01', cat: 'impuesto', suspende: true,
    titulo: 'Falta de acreditación del pago o exención del impuesto',
    fundamento: 'Art. 254.1 LH',
    texto: `DEFECTO SUSPENSIVO — FALTA DE ACREDITACIÓN DEL PAGO, EXENCIÓN O NO SUJECIÓN (art. 254.1 LH)

Ningún documento sujeto a los impuestos establecidos por las leyes de ITP y AJD, IS o ISD podrá inscribirse sin que conste la previa presentación ante la Oficina Liquidadora competente y, en su caso, el pago de la cuota devengada.

Deberá aportarse carta de pago, certificado de exención o declaración de no sujeción expedida por la oficina liquidadora de la Comunidad Autónoma correspondiente.`,
  },
  {
    id: 'imp-02', cat: 'impuesto', suspende: false,
    titulo: 'Advertencia: posible retención IRNR (transmitente no residente)',
    fundamento: 'Art. 25.2 TRLRIRNR · RD 1629/1991',
    texto: `ADVERTENCIA — POSIBLE OBLIGACIÓN DE RETENCIÓN IRNR (art. 25.2 TRLRIRNR)

El transmitente podría tener la condición de no residente fiscal en España. Conforme al art. 25.2 del Texto Refundido de la Ley del Impuesto sobre la Renta de No Residentes, el adquirente queda obligado a retener e ingresar en la AEAT el 3% del precio pactado en la transmisión, salvo que el transmitente acredite fehacientemente su residencia fiscal en España.

Se hace constar esta circunstancia a los efectos oportunos, sin perjuicio de la calificación registral del título.`,
  },

  // ── DESCRIPCIÓN DE FINCA ─────────────────────────────────────
  {
    id: 'desc-01', cat: 'descripcion', suspende: true,
    titulo: 'Descripción de finca incompleta (art. 51 RH)',
    fundamento: 'Arts. 9 LH · 51 RH',
    texto: `DEFECTO SUSPENSIVO — DESCRIPCIÓN DE FINCA INCOMPLETA (arts. 9 LH y 51 RH)

La descripción de la finca que contiene el título no reúne los requisitos mínimos exigidos por el art. 9 de la Ley Hipotecaria y el art. 51 del Reglamento Hipotecario. Concretamente falta o es insuficiente: [INDICAR DATO: naturaleza de la finca / situación / superficie / linderos / referencia catastral].

Deberá rectificarse el título notarial para incluir los datos descriptivos omitidos conforme al art. 153 RN.`,
  },
  {
    id: 'desc-02', cat: 'descripcion', suspende: true,
    titulo: 'Exceso de cabida superior al 10%: dudas sobre identidad de la finca',
    fundamento: 'Arts. 201 y 202 LH',
    texto: `DEFECTO SUSPENSIVO — EXCESO DE CABIDA CON DUDAS SOBRE IDENTIDAD (arts. 201 y 202 LH)

La superficie que se pretende hacer constar excede en más del 10% de la cabida inscrita, lo que, conforme a la doctrina de la DGSJFP, genera dudas fundadas sobre la identidad de la finca y la posible invasión de fincas colindantes o del dominio público.

Para la rectificación descriptiva deberá seguirse el expediente notarial del art. 201 LH con notificación a colindantes, o instarse la coordinación con el Catastro conforme al art. 199 LH previo acuerdo con los colindantes y comunicación a la Administración.`,
  },
  {
    id: 'desc-03', cat: 'descripcion', suspende: false,
    titulo: 'Discordancia entre superficie escriturada y catastral',
    fundamento: 'Arts. 9.b y 18 LH · Res. DGRN 17-11-2015',
    texto: `ADVERTENCIA — DISCORDANCIA ENTRE SUPERFICIE ESCRITURADA Y CATASTRAL

La superficie que figura en el título presenta una diferencia significativa respecto de la que consta en la certificación catastral. La DGSJFP ha señalado que las discordancias descriptivas entre el título y el Catastro, cuando no son meramente de escasa entidad, deben ser aclaradas por el notario autorizante o subsanadas por el interesado para acceder al Registro.

Se recomienda aportar certificación catastral descriptiva y gráfica actualizada o iniciar el procedimiento del art. 199 LH.`,
  },

  // ── GEORREFERENCIACIÓN ───────────────────────────────────────
  {
    id: 'geo-01', cat: 'georref', suspende: false,
    titulo: 'Georreferenciación no aportada (art. 9.b LH)',
    fundamento: 'Art. 9.b LH · Res. conjunta DGRN-DGC 26/10/2015',
    texto: `ADVERTENCIA — GEORREFERENCIACIÓN NO APORTADA (art. 9.b LH)

El título no incorpora la representación gráfica georreferenciada de la finca conforme exige el art. 9.b de la Ley Hipotecaria, por lo que la finca no quedará coordinada con el Catastro. Ello no impide la inscripción del acto documentado, pero se hace constar expresamente que cualquier modificación descriptiva futura requerirá su aportación.

Se invita al interesado a aportar el fichero GML en formato INSPIRE (ETRS89, proyección UTM) para proceder a la coordinación catastro-registro conforme al art. 10 LH.`,
  },
  {
    id: 'geo-02', cat: 'georref', suspende: true,
    titulo: 'Representación gráfica invade dominio público',
    fundamento: 'Arts. 9.b y 199.2 LH · Art. 36 LPAP',
    texto: `DEFECTO SUSPENSIVO — INVASIÓN DE DOMINIO PÚBLICO EN LA REPRESENTACIÓN GRÁFICA (arts. 9.b y 199 LH)

Del análisis de la representación gráfica aportada resulta que la geometría propuesta se superpone con terrenos clasificados como dominio público [INDICAR TIPO: hidráulico / marítimo-terrestre / viario / ferroviario], extremo que impide su inscripción conforme al art. 199.2 LH.

Deberá rectificarse el fichero GML de forma que la geometría quede estrictamente dentro de los límites de la finca sin invadir el dominio público, o acreditarse que el terreno superpuesto ha sido desafectado o concesionado.`,
  },
  {
    id: 'geo-03', cat: 'georref', suspende: true,
    titulo: 'Sistema de referencia no válido (GML)',
    fundamento: 'Res. conjunta DGRN-DGC 26/10/2015, apdo. 4.º',
    texto: `DEFECTO SUSPENSIVO — SISTEMA DE REFERENCIA INCORRECTO EN EL FICHERO GML

La representación gráfica aportada utiliza un sistema de referencia de coordenadas (CRS) distinto del exigido por la Resolución conjunta de la DGRN y la DGC de 26 de octubre de 2015: ETRS89 en proyección UTM para la Península e Islas Baleares, o REGCAN95 en proyección UTM para Canarias.

Deberá regenerarse el fichero GML con las coordenadas expresadas en el sistema de referencia oficial, con las precisiones indicadas en el apdo. 4.º de la citada Resolución conjunta.`,
  },

  // ── FORMA DEL TÍTULO ─────────────────────────────────────────
  {
    id: 'forma-01', cat: 'forma', suspende: true,
    titulo: 'Título no inscribible: documento privado',
    fundamento: 'Art. 3 LH · Art. 1.280 CC',
    texto: `DEFECTO INSUBSANABLE — TÍTULO NO INSCRIBIBLE: DOCUMENTO PRIVADO (art. 3 LH)

La Ley Hipotecaria exige, como regla general, que los títulos a inscribir estén consignados en escritura pública, ejecutoria o documento auténtico expedido por Autoridad judicial, por el Gobierno o sus Agentes en la forma prescrita por los reglamentos (art. 3 LH).

El documento privado presentado no cumple los requisitos de forma exigidos para la inscripción de derechos reales sobre inmuebles. El defecto es insubsanable en su forma actual; deberá elevarse a escritura pública ante notario.`,
  },
  {
    id: 'forma-02', cat: 'forma', suspende: true,
    titulo: 'Obra nueva: falta licencia urbanística o declaración de antigüedad',
    fundamento: 'Art. 28 TRLS 2015 · Arts. 45-54 RD 1093/1997',
    texto: `DEFECTO SUSPENSIVO — FALTA DE ACREDITACIÓN DE LICENCIA URBANÍSTICA (art. 28 TRLS 2015)

Para la inscripción de declaraciones de obra nueva en construcción o terminada, el art. 28 del Real Decreto Legislativo 7/2015 (TRLS) exige la aportación de: (a) licencia urbanística de obras, (b) proyecto técnico visado y (c) certificado técnico de finalización de obra conforme al proyecto, o bien la acreditación de que la acción urbanística ha prescrito (art. 28.4 TRLS) mediante certificación técnica de antigüedad y certificación catastral descriptiva.

Deberá aportarse la documentación indicada conforme a la situación en que se encuentre la construcción.`,
  },
  {
    id: 'forma-03', cat: 'forma', suspende: false,
    titulo: 'División horizontal: descripción de elementos privativos incompleta',
    fundamento: 'Art. 8 LH · Arts. 1 y 5 LPH · Art. 53 RD 1093/1997',
    texto: `DEFECTO A SUBSANAR — DESCRIPCIÓN INCOMPLETA EN PROPIEDAD HORIZONTAL

La escritura de división horizontal o de modificación del título constitutivo no contiene la descripción individualizada de todos los elementos privativos conforme al art. 5 de la Ley de Propiedad Horizontal y al art. 53 del RD 1093/1997 (cuota de participación, superficie útil y construida de cada elemento, anejos vinculados).

Deberá aportarse el correspondiente cuadro de superficies y cuotas completo para todos los elementos del edificio.`,
  },

  // ── CARGAS Y GRAVÁMENES ──────────────────────────────────────
  {
    id: 'carga-01', cat: 'cargas', suspende: true,
    titulo: 'Cancelación de hipoteca: escritura de cancelación insuficiente',
    fundamento: 'Arts. 82 y 179 LH · Art. 144 RH',
    texto: `DEFECTO SUSPENSIVO — CANCELACIÓN DE HIPOTECA: TÍTULO INSUFICIENTE (arts. 82 y 179 LH)

La documentación aportada para la cancelación de la hipoteca inscrita no es suficiente porque [INDICAR MOTIVO: no está elevada a escritura pública / la entidad acreedora no está debidamente representada / el poder del apoderado no alcanza para cancelar / el número de finca o préstamo no coincide con el asiento registral].

Para cancelar la carga deberá aportarse escritura pública de cancelación otorgada por la entidad acreedora o su apoderado con facultades bastantes, o resolución judicial firme que declare la extinción del crédito hipotecario.`,
  },
  {
    id: 'carga-02', cat: 'cargas', suspende: true,
    titulo: 'Prohibición de disponer vigente',
    fundamento: 'Art. 26 LH · Art. 145 RH',
    texto: `DEFECTO SUSPENSIVO — PROHIBICIÓN DE DISPONER VIGENTE (art. 26 LH)

Consta inscrita una prohibición de disponer que afecta a la finca objeto del título calificado. Mientras dicha limitación permanezca vigente no es posible practicar la inscripción del acto de disposición presentado.

Para subsanar el defecto deberá: (a) aportarse el documento acreditativo de la extinción de la prohibición (transcurso del plazo, resolución judicial, etc.) para su cancelación previa, o (b) obtenerse autorización judicial conforme al art. 26 LH si la prohibición es voluntaria.`,
  },
  {
    id: 'carga-03', cat: 'cargas', suspende: false,
    titulo: 'Anotación preventiva de embargo vigente: notificación al ejecutante',
    fundamento: 'Arts. 24 CE · 155 y 236 RH',
    texto: `ADVERTENCIA — ANOTACIÓN PREVENTIVA DE EMBARGO VIGENTE (arts. 155 y 236 RH)

Sobre la finca pesa una anotación preventiva de embargo vigente. Se advierte al adquirente que la transmisión no cancela el embargo y que el bien podrá ser realizado en el procedimiento de apremio, sin perjuicio del derecho del adquirente a ejercitar las acciones que procedan.

El Registrador procederá a la inscripción con notificación al ejecutante del asiento practicado (art. 236 RH) y sin que la constancia registral perjudique la anotación vigente.`,
  },
];

// ── Categorías de defecto ─────────────────────────────────────
export const CATEGORIAS = [
  { id: '',            label: 'Todos los defectos' },
  { id: 'tracto',      label: '🔗 Tracto sucesivo' },
  { id: 'nif',         label: '🆔 NIF / Identificación' },
  { id: 'capacidad',   label: '👤 Capacidad / Representación' },
  { id: 'impuesto',    label: '🏛️ Impuestos / Liquidación' },
  { id: 'descripcion', label: '📐 Descripción de finca' },
  { id: 'georref',     label: '🌍 Georreferenciación' },
  { id: 'forma',       label: '📄 Forma del título' },
  { id: 'cargas',      label: '⛓️ Cargas y gravámenes' },
];

/**
 * Filtra defectos por texto libre y/o categoría.
 * @param {string} busqueda
 * @param {string} cat — id de categoría o '' para todos
 */
export function buscarDefectos(busqueda = '', cat = '') {
  const q = busqueda.trim().toLowerCase();
  return DEFECTOS.filter(d => {
    if (cat && d.cat !== cat) return false;
    if (!q) return true;
    return d.titulo.toLowerCase().includes(q)
        || d.fundamento.toLowerCase().includes(q)
        || d.texto.toLowerCase().includes(q);
  });
}
