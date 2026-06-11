// background.js — Service Worker
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ── URL del Cloudflare Worker (actualiza tras el deploy) ──────
const WORKER_URL = 'https://registro-licencias.fcm1979.workers.dev';

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {

  if (message.type === 'PDF_URL_DETECTED') {
    chrome.runtime.sendMessage({ type: 'PDF_URL_READY', pdfUrl: message.pdfUrl }).catch(() => {});
    return false;
  }

  if (message.type === 'REQUEST_ACTIVE_PDF') {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_PDF_TEXT' }, function (r) {
          sendResponse(r || { pdfUrl: null });
        });
      }
    });
    return true;
  }

  // ── API OVC del Catastro (XML) ────────────────
  if (message.type === 'CONSULTA_CATASTRO') {
    const rc  = (message.rc || '').trim().toUpperCase().replace(/\s/g, '');
    const url = 'https://ovc.catastro.meh.es/OVCServWeb/OVCWcfLibres/OVCCallejero.svc/Consulta_DNPRC?RC=' + rc;

    fetch(url, {
      headers: {
        'Accept': 'text/xml, application/xml',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(xml => sendResponse({ ok: true, xml }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  // ── Validación de licencia LemonSqueezy ───────
  if (message.type === 'VALIDAR_LICENCIA') {
    const { licenseKey, instanceId, action } = message;
    fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key: licenseKey, instance_id: instanceId, action }),
    })
      .then(r => r.json())
      .then(data => sendResponse({ ok: true, valid: data.valid, status: data.status }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  // ── WFS INSPIRE: parcelario catastral por bbox ─
  // Devuelve todas las parcelas catastrales (GML) dentro del
  // bounding box indicado, para detectar solapes con colindantes.
  if (message.type === 'CONSULTA_GML_BBOX') {
    const { minX, minY, maxX, maxY, epsg } = message;
    const srs = 'EPSG::' + (epsg || '25830');
    const base = 'https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx' +
      '?service=wfs&version=2.0.0&request=getfeature' +
      '&count=500' +
      '&srsname=' + encodeURIComponent(srs) +
      '&bbox=' + [minX, minY, maxX, maxY].map(v => v.toFixed(2)).join(',');

    const cabeceras = {
      'Accept': 'text/xml, application/xml',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    };

    // El servicio acepta distintos formatos de typenames según versión:
    // probar 'cp:CadastralParcel' y, si devuelve excepción, 'CP.CadastralParcel'.
    const intentar = (typenames) =>
      fetch(base + '&typenames=' + encodeURIComponent(typenames), { headers: cabeceras })
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); });

    intentar('cp:CadastralParcel')
      .then(xml => {
        if (/ExceptionReport|ExceptionText/i.test(xml)) {
          return intentar('CP.CadastralParcel');
        }
        return xml;
      })
      .then(xml => sendResponse({ ok: true, xml }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  // ── WFS INSPIRE: GML de una parcela por refcat ─
  if (message.type === 'CONSULTA_GML_PARCELA') {
    const rc = (message.rc || '').trim().toUpperCase().replace(/\s/g, '').slice(0, 14);
    const srs = 'EPSG::' + (message.epsg || '25830');
    const url = 'https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx' +
      '?service=wfs&version=2.0.0&request=getfeature' +
      '&STOREDQUERIE_ID=GetParcel&refcat=' + rc +
      '&srsname=' + encodeURIComponent(srs);

    fetch(url, {
      headers: {
        'Accept': 'text/xml, application/xml',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(xml => sendResponse({ ok: true, xml }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  // ── Portal HTML del Catastro (fallback) ───────
  if (message.type === 'CONSULTA_CATASTRO_HTML') {
    const rc  = (message.rc || '').trim().toUpperCase().replace(/\s/g, '');
    const rc1 = rc.slice(0, 7);
    const rc2 = rc.slice(7, 14);
    const url = `https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCListaBienes.aspx?rc1=${rc1}&rc2=${rc2}`;

    fetch(url, {
      headers: {
        'Accept': 'text/html',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(html => sendResponse({ ok: true, html }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

});
