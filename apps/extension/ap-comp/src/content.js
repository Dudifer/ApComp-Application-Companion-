/**
 * ApComp content script.
 *
 * - Runs once the page settles, asks the extractors whether the current page
 *   "looks like" a job posting, and if so injects a small floating "Save to
 *   ApComp" button.
 * - Retries with backoff so SPA-rendered pages (Greenhouse job-boards,
 *   Workday, LinkedIn) eventually get the button.
 * - Responds to APCOMP_EXTRACT messages from the popup.
 * - On capture, posts to the background service worker which forwards to the
 *   API.
 *
 * NOTE: `__apcompExtractors` is set by `src/extractors/index.js` which is
 * listed alongside this file in `manifest.json`'s `content_scripts`.
 */
(function () {
  if (window.__apcompContentLoaded) return;
  window.__apcompContentLoaded = true;

  const extractors = window.__apcompExtractors;
  if (!extractors) return;

  const isTopFrame = window === window.top;

  function getExtracted() {
    try {
      return extractors.run();
    } catch (err) {
      console.warn('[apcomp] extractor run failed:', err);
      return { url: location.href, sourceHost: location.host, partial: true };
    }
  }

  function looksLikeJobPosting(extracted) {
    if (!extracted) return false;
    if (extracted.partial) return false;
    return !!(extracted.title && extracted.company);
  }

  function showToast(message, ok = true) {
    const el = document.createElement('div');
    el.className = `apcomp-toast ${ok ? 'apcomp-toast--ok' : 'apcomp-toast--err'}`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('apcomp-toast--show'), 10);
    setTimeout(() => {
      el.classList.remove('apcomp-toast--show');
      setTimeout(() => el.remove(), 300);
    }, 2800);
  }

  function injectButton() {
    if (document.getElementById('apcomp-fab')) return;

    const btn = document.createElement('button');
    btn.id = 'apcomp-fab';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Save this job to ApComp');
    btn.innerHTML = `
      <span class="apcomp-fab__icon" aria-hidden="true">+</span>
      <span class="apcomp-fab__label">Save to ApComp</span>
    `;

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.disabled = true;
      btn.classList.add('apcomp-fab--loading');
      const payload = getExtracted();

      try {
        const resp = await chrome.runtime.sendMessage({
          type: 'APCOMP_CAPTURE',
          payload,
        });
        if (resp?.ok) {
          showToast(`Saved "${resp.job.title}" to ApComp`, true);
          btn.classList.add('apcomp-fab--saved');
          setTimeout(() => btn.classList.remove('apcomp-fab--saved'), 1500);
        } else {
          showToast(`Save failed: ${resp?.error ?? 'unknown error'}`, false);
        }
      } catch (err) {
        showToast(`Save failed: ${err.message}`, false);
      } finally {
        btn.disabled = false;
        btn.classList.remove('apcomp-fab--loading');
      }
    });

    document.body.appendChild(btn);
  }

  // Pages like Greenhouse's job-boards.greenhouse.io and Workday render the
  // job content asynchronously after document_idle. Retry with backoff up to
  // ~18s total before giving up.
  const INJECT_RETRY_DELAYS_MS = [400, 1200, 2500, 5000, 9000];
  let injectAttempt = 0;

  function maybeInject() {
    if (!isTopFrame) return;
    if (document.getElementById('apcomp-fab')) return;

    const extracted = getExtracted();
    if (looksLikeJobPosting(extracted)) {
      injectButton();
      injectAttempt = 0;
      return;
    }
    if (injectAttempt < INJECT_RETRY_DELAYS_MS.length) {
      const delay = INJECT_RETRY_DELAYS_MS[injectAttempt++];
      setTimeout(maybeInject, delay);
    }
  }

  function resetAndRetry() {
    injectAttempt = 0;
    const existing = document.getElementById('apcomp-fab');
    if (existing) existing.remove();
    setTimeout(maybeInject, 400);
  }

  function injectStyles() {
    if (document.getElementById('apcomp-style')) return;
    const style = document.createElement('style');
    style.id = 'apcomp-style';
    style.textContent = `
      #apcomp-fab {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 2147483647;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        background: #1a1814;
        color: #faf9f7;
        font: 500 14px/1 'DM Sans', system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 999px;
        box-shadow: 0 6px 20px rgba(26,24,20,0.25), 0 2px 6px rgba(26,24,20,0.15);
        cursor: pointer;
        transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
      }
      #apcomp-fab:hover { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(26,24,20,0.3); }
      #apcomp-fab[disabled] { opacity: 0.6; cursor: progress; }
      #apcomp-fab .apcomp-fab__icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px; height: 18px;
        background: #c9622f;
        color: white;
        border-radius: 999px;
        font-weight: 700;
        font-size: 14px;
        line-height: 1;
      }
      #apcomp-fab.apcomp-fab--saved { background: #2d7d4f; }
      #apcomp-fab.apcomp-fab--saved .apcomp-fab__icon { background: white; color: #2d7d4f; }
      #apcomp-fab.apcomp-fab--loading .apcomp-fab__icon { animation: apcomp-spin 0.8s linear infinite; }
      @keyframes apcomp-spin { to { transform: rotate(360deg); } }

      .apcomp-toast {
        position: fixed;
        bottom: 80px;
        right: 20px;
        z-index: 2147483647;
        padding: 10px 14px;
        border-radius: 8px;
        font: 500 13px/1.3 'DM Sans', system-ui, sans-serif;
        background: #1a1814;
        color: #faf9f7;
        max-width: 320px;
        opacity: 0;
        transform: translateY(8px);
        transition: opacity 0.2s ease, transform 0.2s ease;
        box-shadow: 0 8px 24px rgba(26,24,20,0.25);
      }
      .apcomp-toast--show { opacity: 1; transform: translateY(0); }
      .apcomp-toast--err { background: #991b1b; }
      .apcomp-toast--ok { background: #2d7d4f; }
    `;
    document.documentElement.appendChild(style);
  }

  injectStyles();

  // Watch for SPA URL changes (LinkedIn, Workday) and re-run extraction.
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      resetAndRetry();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Initial pass — maybeInject() retries itself with backoff if extraction
  // doesn't produce a complete result yet.
  setTimeout(maybeInject, 400);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'APCOMP_EXTRACT') {
      sendResponse({ extracted: getExtracted() });
      return false;
    }
    return false;
  });
})();
