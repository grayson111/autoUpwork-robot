(function () {
  const params = new URLSearchParams(window.location.search);
  if (params.get('ref') !== 'mybot') return;

  const jobId = params.get('job_id');
  if (!jobId) {
    console.warn('[Upwork Copilot] missing job_id in URL');
    return;
  }

  // Set this in extension options or replace before load (Hostinger BASE_URL)
  const API_BASE =
    localStorage.getItem('upwork_copilot_api') ||
    'https://magenta-lobster-733311.hostingersite.com';

  function dispatchInputEvents(el, value) {
    el.focus();
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function findCoverLetterTextarea() {
    return (
      document.querySelector('textarea[id^="cover-letter"]') ||
      document.querySelector('textarea.cl-textarea') ||
      document.querySelector('textarea[name*="cover"]') ||
      document.querySelector('[data-test="cover-letter"] textarea')
    );
  }

  function fillCoverLetter(text) {
    const textarea = findCoverLetterTextarea();
    if (!textarea) return false;
    dispatchInputEvents(textarea, text);
    console.log('[Upwork Copilot] Cover letter filled');
    return true;
  }

  async function run() {
    let coverLetter = '';
    try {
      const url = `${API_BASE.replace(/\/$/, '')}/api/proposal?job_id=${encodeURIComponent(jobId)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.success || !data.cover_letter) {
        console.warn('[Upwork Copilot] API:', data.error || res.status);
        return;
      }
      coverLetter = data.cover_letter;
    } catch (err) {
      console.error('[Upwork Copilot] fetch failed:', err);
      return;
    }

    let attempts = 0;
    const maxAttempts = 60;
    const timer = setInterval(() => {
      attempts += 1;
      if (fillCoverLetter(coverLetter)) {
        clearInterval(timer);
        return;
      }
      if (attempts >= maxAttempts) {
        clearInterval(timer);
        console.warn('[Upwork Copilot] textarea not found after polling');
      }
    }, 500);
  }

  run();
})();
