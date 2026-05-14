/**
 * ApComp content script.
 *
 * - Save button (bottom-right): appears on pages where the extractors find a
 *   job posting. One click captures the page into ApComp.
 * - Auto-fill button (just to the left of Save): appears on pages that look
 *   like job applications (many form fields and/or an "Add experience"
 *   button). One click fetches the user's CV profile and fills the form.
 *
 * NOTE: `__apcompExtractors` is set by `src/extractors/index.js` and
 * `__apcompAutofiller` by `src/autofiller/index.js` — both listed alongside
 * this file in `manifest.json`'s `content_scripts`.
 */
(function () {
  if (window.__apcompContentLoaded) return;
  window.__apcompContentLoaded = true;

  const extractors = window.__apcompExtractors;
  const autofiller = window.__apcompAutofiller;
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

  function looksLikeApplicationPage() {
    if (!autofiller) return false;
    try { return autofiller.looksLikeApplicationPage(); }
    catch (_) { return false; }
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
    }, 3500);
  }

  // ---------------- Save FAB ----------------

  function injectSaveButton() {
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
        const resp = await chrome.runtime.sendMessage({ type: 'APCOMP_CAPTURE', payload });
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

  // ---------------- Auto-fill FAB ----------------

  async function runAutoFill(buttonEl) {
    let profileResp;
    try {
      profileResp = await chrome.runtime.sendMessage({ type: 'APCOMP_GET_PROFILE' });
    } catch (err) {
      showToast(`Couldn't fetch CV: ${err.message}`, false);
      return;
    }
    if (!profileResp?.ok) {
      showToast(`Couldn't fetch CV: ${profileResp?.error ?? 'unknown'}`, false);
      return;
    }
    const profile = profileResp.profile;
    if (!profile?.roles?.length && !profile?.name) {
      showToast('No CV uploaded yet — upload one in Resume Builder.', false);
      return;
    }

    try {
      const result = await autofiller.autoFill(profile);
      const parts = [];
      if (result.rolesFilled) parts.push(`${result.rolesFilled}/${result.rolesAttempted} roles`);
      const idFills = result.filled.filter((s) => !s.startsWith('role#') && !s.startsWith('q:')).length;
      if (idFills) parts.push(`${idFills} identity field(s)`);
      const qFills = result.filled.filter((s) => s.startsWith('q:')).length;
      if (qFills) parts.push(`${qFills} hardcoded answer(s)`);
      const msg = parts.length ? `Auto-fill: ${parts.join(', ')} filled` : 'Auto-fill found nothing to fill on this page.';
      showToast(msg, result.errors.length === 0);
      if (result.errors.length) {
        console.warn('[apcomp] autofill errors:', result.errors);
        console.info('[apcomp] autofill detail:', result);
      }
    } catch (err) {
      showToast(`Auto-fill failed: ${err.message}`, false);
      console.error('[apcomp] autofill exception:', err);
    } finally {
      if (buttonEl) {
        buttonEl.disabled = false;
        buttonEl.classList.remove('apcomp-fab--loading');
      }
    }
  }

  function injectAutoFillButton() {
    if (!autofiller) return;
    if (document.getElementById('apcomp-autofill-fab')) return;

    const btn = document.createElement('button');
    btn.id = 'apcomp-autofill-fab';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Auto-fill this application with your CV');
    btn.innerHTML = `
      <span class="apcomp-fab__icon" aria-hidden="true">✎</span>
      <span class="apcomp-fab__label">Auto-fill</span>
    `;

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.disabled = true;
      btn.classList.add('apcomp-fab--loading');
      await runAutoFill(btn);
    });

    document.body.appendChild(btn);
  }

  // ---------------- Pages on which to inject which button ----------------

  const INJECT_RETRY_DELAYS_MS = [400, 1200, 2500, 5000, 9000];
  let injectAttempt = 0;

  function maybeInject() {
    if (!isTopFrame) return;

    const haveSave = !!document.getElementById('apcomp-fab');
    const haveAutofill = !!document.getElementById('apcomp-autofill-fab');

    if (!haveSave) {
      const extracted = getExtracted();
      if (looksLikeJobPosting(extracted)) injectSaveButton();
    }
    if (!haveAutofill && looksLikeApplicationPage()) injectAutoFillButton();

    // Retry until both buttons are decided (either injected or skipped due to
    // failing detection) — keeps the cost low while supporting SPAs.
    if (injectAttempt < INJECT_RETRY_DELAYS_MS.length) {
      const delay = INJECT_RETRY_DELAYS_MS[injectAttempt++];
      setTimeout(maybeInject, delay);
    }
  }

  function resetAndRetry() {
    injectAttempt = 0;
    const a = document.getElementById('apcomp-fab');
    if (a) a.remove();
    const b = document.getElementById('apcomp-autofill-fab');
    if (b) b.remove();
    setTimeout(maybeInject, 400);
  }

  // ---------------- Injected styles ----------------

  function injectStyles() {
    if (document.getElementById('apcomp-style')) return;
    const style = document.createElement('style');
    style.id = 'apcomp-style';
    style.textContent = `
      #apcomp-fab, #apcomp-autofill-fab {
        position: fixed;
        bottom: 90px;
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
      #apcomp-fab { right: 20px; }
      #apcomp-autofill-fab { right: 180px; background: #2d3640; }
      #apcomp-fab:hover, #apcomp-autofill-fab:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 28px rgba(26,24,20,0.3);
      }
      #apcomp-fab[disabled], #apcomp-autofill-fab[disabled] { opacity: 0.6; cursor: progress; }
      #apcomp-fab .apcomp-fab__icon, #apcomp-autofill-fab .apcomp-fab__icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px; height: 18px;
        background: #c9622f;
        color: white;
        border-radius: 999px;
        font-weight: 700;
        font-size: 13px;
        line-height: 1;
      }
      #apcomp-autofill-fab .apcomp-fab__icon { background: #6ba0d4; }
      #apcomp-fab.apcomp-fab--saved { background: #2d7d4f; }
      #apcomp-fab.apcomp-fab--saved .apcomp-fab__icon { background: white; color: #2d7d4f; }
      #apcomp-fab.apcomp-fab--loading .apcomp-fab__icon,
      #apcomp-autofill-fab.apcomp-fab--loading .apcomp-fab__icon { animation: apcomp-spin 0.8s linear infinite; }
      @keyframes apcomp-spin { to { transform: rotate(360deg); } }

      .apcomp-toast {
        position: fixed;
        bottom: 150px;
        right: 20px;
        z-index: 2147483647;
        padding: 10px 14px;
        border-radius: 8px;
        font: 500 13px/1.3 'DM Sans', system-ui, sans-serif;
        background: #1a1814;
        color: #faf9f7;
        max-width: 360px;
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

  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      resetAndRetry();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  setTimeout(maybeInject, 400);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'APCOMP_EXTRACT') {
      sendResponse({ extracted: getExtracted() });
      return false;
    }
    if (message?.type === 'APCOMP_AUTOFILL') {
      (async () => {
        try {
          if (!autofiller) {
            sendResponse({ ok: false, error: 'Autofiller not loaded on this page' });
            return;
          }
          const result = await autofiller.autoFill(message.profile);
          sendResponse({ ok: true, result });
        } catch (err) {
          sendResponse({ ok: false, error: err.message });
        }
      })();
      return true;
    }
    return false;
  });
})();
