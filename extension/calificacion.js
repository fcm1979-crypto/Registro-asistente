// ─────────────────────────────────────────────────────────────
// calificacion.js — Calificación asistida de escrituras
// Analiza el objeto parseEscritura + datos Catastro y genera
// una lista de checks para el registrador, sin necesidad de
// ningún sistema externo (Experia, Inforeg, etc.)
// ─────────────────────────────────────────────────────────────

export function generarCalificacion(analisis, datosCatastro, opciones = {}) {
  const checks = [];
  const tipo = analisis.tipoOperacion?.value;

  // ── 1. Tipo de operación ──────────────────────────────────────
  if (tipo && tipo !== 'desconocido') {
    checks.push({
      nivel: 'verde',
      titulo: 'Tipo de operación identificado',
      detalle: tipo.charAt(0).toUpperCase() + tipo.slice(1),
    });
  } else {
    checks.push({
      nivel: 'naranja',
      titulo: 'Tipo de operación no identificado',
      detalle: 'Revisar manualmente el objeto del documento.',
    });
  }

  // ── 2. Notario ────────────────────────────────────────────────
  if (analisis.notario?.value) {
    checks.push({
      nivel: 'verde',
      titulo: 'Notario autoriza el documento',
      detalle: analisis.notario.value,
    });
  } else {
    checks.push({
      nivel: 'naranja',
      titulo: 'Notario no identificado',
      detalle: 'Verificar quién autoriza el documento.',
    });
  }

  // ── 3. Fecha de otorgamiento ──────────────────────────────────
  if (analisis.fecha?.value) {
    checks.push({
      nivel: 'verde',
      titulo: 'Fecha de otorgamiento',
      detalle: analisis.fecha.value,
    });
  } else {
    checks.push({
      nivel: 'naranja',
      titulo: 'Fecha no detectada',
      detalle: 'Verificar la fecha de autorización de la escritura.',
    });
  }

  // ── 4. Referencia catastral ───────────────────────────────────
  if (analisis.refCatastral?.value) {
    checks.push({
      nivel: 'verde',
      titulo: 'Referencia catastral presente',
      detalle: analisis.refCatastral.value,
    });
  } else {
    checks.push({
      nivel: 'rojo',
      titulo: 'Falta referencia catastral',
      detalle: 'Obligatoria en transmisiones (art. 43 TRLCI). Defecto subsanable.',
    });
  }

  // ── 5. NIF / DNI de otorgantes ────────────────────────────────
  const nifs = analisis.documentos?.value;
  if (nifs && nifs.length > 0) {
    checks.push({
      nivel: 'verde',
      titulo: nifs.length + ' NIF/DNI detectado' + (nifs.length > 1 ? 's' : ''),
      detalle: nifs.join(' · '),
    });
  } else {
    checks.push({
      nivel: 'naranja',
      titulo: 'NIF/DNI no detectados',
      detalle: 'Pueden estar protegidos en esta copia simple. Verificar en original.',
    });
  }

  // ── 6. Checks específicos por tipo de operación ───────────────

  if (tipo === 'compraventa') {
    if (analisis.precio?.value) {
      checks.push({
        nivel: 'verde',
        titulo: 'Precio de transmisión declarado',
        detalle: analisis.precio.value,
      });
    } else {
      checks.push({
        nivel: 'rojo',
        titulo: 'Precio de transmisión no declarado',
        detalle: 'En compraventa es obligatorio consignar el precio (art. 1445 CC). Defecto.',
      });
    }
  }

  if (tipo === 'hipoteca') {
    if (analisis.precio?.value) {
      checks.push({
        nivel: 'verde',
        titulo: 'Capital hipotecario identificado',
        detalle: analisis.precio.value,
      });
    } else {
      checks.push({
        nivel: 'naranja',
        titulo: 'Capital hipotecario no detectado',
        detalle: 'Verificar responsabilidad hipotecaria total (principal + intereses + costas).',
      });
    }
  }

  if (tipo === 'herencia') {
    const tits = analisis.titulares?.value;
    if (tits && tits.length > 0) {
      checks.push({
        nivel: 'verde',
        titulo: 'Herederos/adjudicatarios identificados',
        detalle: tits.join(' · '),
      });
    } else {
      checks.push({
        nivel: 'naranja',
        titulo: 'Herederos no detectados',
        detalle: 'Verificar acta de notoriedad o testamento referenciado.',
      });
    }
  }

  if (tipo === 'cancelacion') {
    checks.push({
      nivel: 'verde',
      titulo: 'Escritura de cancelación',
      detalle: 'Verificar que la hipoteca a cancelar consta inscrita y la entidad acreedora coincide.',
    });
  }

  // ── 7. Cargas y gravámenes ────────────────────────────────────
  const cargas = analisis.cargas?.value;
  if (cargas) {
    if (cargas.length === 1 && cargas[0] === 'Libre de cargas') {
      checks.push({
        nivel: 'verde',
        titulo: 'Libre de cargas y gravámenes',
        detalle: 'El documento declara la finca libre de cargas.',
      });
    } else {
      checks.push({
        nivel: 'naranja',
        titulo: 'Cargas o gravámenes detectados',
        detalle: cargas.join(', ') + '. Verificar cancelación registral previa o simultánea.',
      });
    }
  } else {
    checks.push({
      nivel: 'naranja',
      titulo: 'Estado de cargas no determinado',
      detalle: 'No se encontró declaración expresa sobre cargas. Revisar documento.',
    });
  }

  // ── 8. Superficie ─────────────────────────────────────────────
  if (analisis.superficie?.numerico) {
    const sup = analisis.superficie.numerico;

    if (datosCatastro?.superficie && !datosCatastro.soloEnlace) {
      const catSup = datosCatastro.superficie;
      const diff = Math.abs(sup - catSup);
      const pct  = (diff / catSup) * 100;

      if (pct > 10) {
        checks.push({
          nivel: 'rojo',
          titulo: 'Posible exceso de cabida (' + pct.toFixed(1) + '%)',
          detalle: 'Escritura: ' + analisis.superficie.value +
                   ' · Catastro: ' + catSup + ' m² · Dif.: ' + diff.toFixed(1) +
                   ' m². Puede requerir expediente art. 201 LH.',
        });
      } else if (pct > 5) {
        checks.push({
          nivel: 'naranja',
          titulo: 'Diferencia de superficie con Catastro (' + pct.toFixed(1) + '%)',
          detalle: diff.toFixed(1) + ' m² de diferencia. Aclarar con interesados.',
        });
      } else {
        checks.push({
          nivel: 'verde',
          titulo: 'Superficie coincide con Catastro',
          detalle: analisis.superficie.value + ' · Diferencia < 5%',
        });
      }
    } else {
      checks.push({
        nivel: 'verde',
        titulo: 'Superficie detectada',
        detalle: analisis.superficie.value + (datosCatastro?.soloEnlace
          ? ' · Sin datos Catastro para contrastar (consultar manualmente)'
          : ' · Catastro no consultado'),
      });
    }
  } else {
    checks.push({
      nivel: 'naranja',
      titulo: 'Superficie no detectada',
      detalle: 'Verificar descripción de la finca en el cuerpo del documento.',
    });
  }

  // ── 9. Linderos ───────────────────────────────────────────────
  if (analisis.linderos?.value) {
    checks.push({
      nivel: 'verde',
      titulo: 'Linderos presentes',
      detalle: analisis.linderos.value.slice(0, 100) + (analisis.linderos.value.length > 100 ? '…' : ''),
    });
  } else {
    checks.push({
      nivel: 'naranja',
      titulo: 'Linderos no detectados',
      detalle: 'Necesarios para descripción registral completa e inmatriculación.',
    });
  }

  // ── 9bis. Situación concursal (TRLC) ─────────────────────────
  // El registrador debe comprobar en el Registro Público Concursal
  // que ningún otorgante tiene limitadas o suspendidas sus facultades
  // de disposición. La consulta debe referirse al momento de la
  // presentación originaria del título.
  {
    const otorgantes = analisis.titulares?.value || [];
    const listaOtorgantes = otorgantes.length
      ? ' Otorgantes detectados: ' + otorgantes.slice(0, 4).join(', ') + (otorgantes.length > 4 ? '…' : '') + '.'
      : '';
    if (opciones.concursalVerificado) {
      checks.push({
        nivel: 'verde',
        titulo: 'Situación concursal verificada',
        detalle: 'Consultado el Registro Público Concursal: sin limitación de facultades dispositivas de los otorgantes.',
        accion: 'concursal',
      });
    } else {
      checks.push({
        nivel: 'naranja',
        titulo: 'Situación concursal sin verificar',
        detalle: 'Comprobar en el Registro Público Concursal que ningún otorgante tiene limitadas o suspendidas sus facultades de disposición (arts. 106 y 109 TRLC). La comprobación debe referirse al momento de la presentación del título.' + listaOtorgantes,
        accion: 'concursal',
      });
    }
  }

  // ── 10. Resumen ejecutivo ─────────────────────────────────────
  const rojos    = checks.filter(c => c.nivel === 'rojo').length;
  const naranjas = checks.filter(c => c.nivel === 'naranja').length;

  let resumen;
  if (rojos > 0) {
    resumen = { nivel: 'rojo', texto: rojos + ' defecto' + (rojos > 1 ? 's' : '') + ' detectado' + (rojos > 1 ? 's' : '') + ' · Calificación con defectos' };
  } else if (naranjas > 0) {
    resumen = { nivel: 'naranja', texto: naranjas + ' advertencia' + (naranjas > 1 ? 's' : '') + ' · Revisar antes de inscribir' };
  } else {
    resumen = { nivel: 'verde', texto: 'Sin defectos detectados · Puede proceder la inscripción' };
  }

  return { checks, resumen };
}
