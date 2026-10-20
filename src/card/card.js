(() => {
  const cardUrl = 'https://cesararturo.com/card';
  const status = document.getElementById('share-status');
  const share = document.getElementById('share-card');
  const fallback = document.getElementById('copy-fallback');
  const urlField = document.getElementById('card-url');

  // Keep preview traffic out of GA4. Contact links never depend on analytics.
  if (location.hostname === 'cesararturo.com' || location.hostname === 'www.cesararturo.com') {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', 'G-5756WJ96DW', {page_location: cardUrl});
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=G-5756WJ96DW';
    document.head.append(script);
  }

  function track(name, label) {
    if (typeof window.gtag === 'function') {
      window.gtag('event', name, {event_category: 'digital_card', event_label: label, transport_type: 'beacon'});
    }
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-card-event]');
    if (link) track(link.dataset.cardEvent, link.dataset.cardLabel);
  });
  document.getElementById('qr-details').addEventListener('toggle', (event) => {
    if (event.target.open) track('qr_view', 'card_qr');
  });

  async function copyLink() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(cardUrl);
      status.textContent = 'Enlace copiado.';
      track('card_copy', 'success');
    } catch {
      fallback.hidden = false;
      urlField.focus();
      urlField.select();
      status.textContent = 'Puedes copiar el enlace desde este campo.';
      track('card_copy', 'manual');
    }
  }

  share.hidden = false;
  share.addEventListener('click', async () => {
    if (share.disabled) return;
    share.disabled = true;
    status.textContent = '';
    fallback.hidden = true;
    try {
      if (typeof navigator.share === 'function') {
        track('card_share', 'attempt');
        try {
          await navigator.share({title: 'Cesar Arturo · Desarrollo web y SEO', url: cardUrl});
          track('card_share', 'completed');
        } catch (error) {
          if (error.name === 'AbortError') {
            track('card_share', 'cancelled');
            return;
          }
          await copyLink();
        }
      } else {
        await copyLink();
      }
    } finally {
      share.disabled = false;
    }
  });
})();
