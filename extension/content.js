// ─────────────────────────────────────────────
// content.js — Content Script (versión simplificada)
// Solo detecta si hay un PDF en la página y
// comunica la URL a la sidebar. El procesamiento
// lo hace la sidebar directamente (sin módulos aquí).
// ─────────────────────────────────────────────

(function () {
  'use strict';

  function obtenerURLdePDF() {
    if (document.contentType === 'application/pdf') return window.location.href;
    if (window.location.href.toLowerCase().endsWith('.pdf')) return window.location.href;
    const embed = document.querySelector('embed[type="application/pdf"]');
    if (embed && embed.src) return embed.src;
    const iframe = document.querySelector('iframe[src*=".pdf"]');
    if (iframe && iframe.src) return iframe.src;
    return null;
  }

  // Responder cuando la sidebar pregunta si hay PDF activo
  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.type === 'GET_PDF_TEXT') {
      var url = obtenerURLdePDF();
      sendResponse({ pdfUrl: url || null });
    }
    return false;
  });

  // Notificar al background si detectamos PDF al cargar la página
  var url = obtenerURLdePDF();
  if (url) {
    chrome.runtime.sendMessage({ type: 'PDF_URL_DETECTED', pdfUrl: url }, function () {
      // Silenciamos el error si el service worker está dormido (MV3 normal)
      void chrome.runtime.lastError;
    });
  }

})();
