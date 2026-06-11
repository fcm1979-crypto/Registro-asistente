// ─────────────────────────────────────────────────────────────
// factura.js — Generación de factura registral en PDF
// Abre una nueva pestaña con el HTML de la factura y
// dispara automáticamente el diálogo de impresión/guardar PDF.
// ─────────────────────────────────────────────────────────────

import { calcularHonorarios } from './arancel.js';

// Formateador de moneda (es-ES)
function eur(n) {
  return (n || 0).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' €';
}

/**
 * Genera la factura y la abre en una nueva pestaña lista para imprimir.
 *
 * @param {object} opts
 *   opts.registrador  { nombre, nif, nombreRegistro, direccion, municipio }
 *   opts.cliente      { nombre, nif }
 *   opts.valor        número (base arancel)
 *   opts.tipo         string (compraventa, hipoteca…)
 *   opts.numeroFactura string
 *   opts.fecha        string (YYYY-MM-DD)
 *   opts.extra        array de líneas adicionales (opcional)
 */
export function abrirFacturaPDF(opts) {
  const { registrador, cliente, valor, tipo, numeroFactura, fecha, extra } = opts;
  const calc = calcularHonorarios(valor || 0, tipo, extra || []);
  const html = plantillaFactura(registrador, cliente, calc, {
    numeroFactura: numeroFactura || '—',
    fecha: fecha
      ? new Date(fecha + 'T00:00:00').toLocaleDateString('es-ES')
      : new Date().toLocaleDateString('es-ES'),
    tipo,
    valor,
  });

  // Abrir en nueva pestaña vía Blob URL (funciona en side panel MV3)
  const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  // Revocar URL tras 60 s para liberar memoria
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  if (!win) {
    alert('El navegador bloqueó la ventana emergente.\nPermite ventanas emergentes para esta extensión e inténtalo de nuevo.');
  }
}

// ── Plantilla HTML de la factura ─────────────────────────────
function plantillaFactura(reg, cli, calc, meta) {

  const filasLineas = calc.lineas.map(l => `
    <tr>
      <td>${l.concepto}</td>
      <td class="c">${l.base ? eur(l.base) : '—'}</td>
      <td class="r">${l.norma}</td>
      <td class="r imp">${eur(l.honor)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Factura ${meta.numeroFactura}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#1a1a2e;padding:36px 44px;background:#fff}
  h1{font-size:13px;font-weight:700;color:#1e3a5f;margin:0}
  .cabecera{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1e3a5f;padding-bottom:18px;margin-bottom:22px}
  .logo{font-size:30px;margin-right:10px;vertical-align:middle}
  .reg-info{font-size:11px;color:#555;line-height:1.7;margin-top:4px}
  .factura-num{font-size:22px;font-weight:800;color:#1e3a5f;text-align:right}
  .factura-meta{font-size:11px;color:#666;text-align:right;margin-top:4px;line-height:1.7}
  .partes{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:24px}
  .parte{border:1px solid #dde2f0;border-radius:6px;padding:12px 14px}
  .parte-tit{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#8a94ae;margin-bottom:7px}
  .parte-nombre{font-size:13px;font-weight:700;color:#1a1a2e}
  .parte-dato{font-size:11px;color:#555;margin-top:2px}
  table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:11px}
  thead th{background:#1e3a5f;color:#fff;padding:8px 10px;text-align:left;font-size:10.5px;font-weight:700}
  tbody tr:nth-child(even){background:#f5f6fa}
  tbody td{padding:9px 10px;border-bottom:1px solid #e8eaf4;vertical-align:middle}
  .c{text-align:center} .r{text-align:right} .imp{font-weight:600}
  .totales{margin-left:auto;width:260px;font-size:12px}
  .totales td{padding:5px 10px}
  .totales .sep td{border-top:1px solid #dde2f0;padding-top:8px}
  .totales .gran td{border-top:2px solid #1e3a5f;padding-top:9px;font-weight:800;font-size:14px;color:#1e3a5f}
  .totales .r2{text-align:right}
  .pie{margin-top:28px;border-top:1px solid #dde2f0;padding-top:14px;font-size:9.5px;color:#888;line-height:1.7}
  @media print{
    body{padding:20px 26px}
    @page{margin:1.5cm}
  }
</style>
</head>
<body>

<div class="cabecera">
  <div>
    <div><span class="logo">⚖️</span><span style="font-size:18px;font-weight:800;color:#1e3a5f;vertical-align:middle">${reg.nombreRegistro || 'Registro de la Propiedad'}</span></div>
    <div class="reg-info">
      Registrador/a: <strong>${reg.nombre || '—'}</strong> &nbsp;·&nbsp; NIF: ${reg.nif || '—'}<br>
      ${reg.direccion ? reg.direccion + '<br>' : ''}
      ${reg.municipio || ''}
    </div>
  </div>
  <div>
    <div class="factura-num">FACTURA Nº ${meta.numeroFactura}</div>
    <div class="factura-meta">Fecha: ${meta.fecha}</div>
  </div>
</div>

<div class="partes">
  <div class="parte">
    <div class="parte-tit">Emisor · Registrador</div>
    <div class="parte-nombre">${reg.nombre || '—'}</div>
    <div class="parte-dato">NIF: ${reg.nif || '—'}</div>
    <div class="parte-dato">${reg.nombreRegistro || ''}</div>
    ${reg.direccion ? `<div class="parte-dato">${reg.direccion}</div>` : ''}
    ${reg.municipio ? `<div class="parte-dato">${reg.municipio}</div>` : ''}
  </div>
  <div class="parte">
    <div class="parte-tit">Destinatario · Cliente</div>
    <div class="parte-nombre">${cli.nombre || '—'}</div>
    <div class="parte-dato">NIF/DNI: ${cli.nif || '—'}</div>
    ${cli.direccion ? `<div class="parte-dato">${cli.direccion}</div>` : ''}
  </div>
</div>

<table>
  <thead>
    <tr>
      <th style="width:42%">Concepto</th>
      <th style="width:18%;text-align:center">Base arancel</th>
      <th style="width:28%;text-align:right">Fundamento legal</th>
      <th style="width:12%;text-align:right">Importe</th>
    </tr>
  </thead>
  <tbody>${filasLineas}</tbody>
</table>

<table class="totales">
  <tr><td>Subtotal honorarios</td><td class="r2">${eur(calc.subtotal)}</td></tr>
  <tr class="sep"><td>Base imponible</td><td class="r2">${eur(calc.subtotal)}</td></tr>
  <tr><td>IVA (21 %)</td><td class="r2">${eur(calc.iva)}</td></tr>
  <tr class="gran"><td>TOTAL A PAGAR</td><td class="r2">${eur(calc.total)}</td></tr>
</table>

<div class="pie">
  Honorarios calculados conforme al Arancel de los Registradores de la Propiedad (RD 1427/1989,
  actualizado). IVA al tipo general del 21 % (art. 90 LIVA). Operación inscrita: ${meta.tipo || '—'}.
  Valor tomado como base: ${meta.valor ? eur(meta.valor) : '—'}.<br>
  Este documento tiene carácter de factura a efectos del RD 1619/2012 (Reglamento de
  Facturación). La presente factura acredita la prestación del servicio registral descrito.
</div>

<script>window.addEventListener('load', function(){ window.print(); });<\/script>
</body>
</html>`;
}
