/**
 * ApComp extension — background service worker (MV3).
 *
 * Responsibilities:
 *  - Provide a single message router between the content script, the popup,
 *    and the ApComp API.
 *  - Persist the API base URL in chrome.storage so the user can point at a
 *    deployed instance later.
 *  - Echo helpful badge state when a capture succeeds / fails.
 */

const DEFAULT_API_BASE = 'http://localhost:3000';

async function getApiBase() {
  const { apiBase } = await chrome.storage.sync.get({ apiBase: DEFAULT_API_BASE });
  return apiBase || DEFAULT_API_BASE;
}

async function postCapture(payload) {
  const base = await getApiBase();
  const res = await fetch(`${base}/jobs/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

function flashBadge(tabId, text, color) {
  try {
    chrome.action.setBadgeBackgroundColor({ color });
    chrome.action.setBadgeText({ text, tabId });
    setTimeout(() => chrome.action.setBadgeText({ text: '', tabId }), 2500);
  } catch (_) {
    // Tab may have closed already — ignore.
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return false;

  if (message.type === 'APCOMP_CAPTURE') {
    postCapture(message.payload)
      .then((job) => {
        flashBadge(sender.tab?.id, '✓', '#2d7d4f');
        sendResponse({ ok: true, job });
      })
      .catch((err) => {
        flashBadge(sender.tab?.id, '!', '#c9622f');
        sendResponse({ ok: false, error: err.message });
      });
    return true; // async response
  }

  if (message.type === 'APCOMP_GET_API_BASE') {
    getApiBase().then((apiBase) => sendResponse({ apiBase }));
    return true;
  }

  if (message.type === 'APCOMP_SET_API_BASE') {
    chrome.storage.sync.set({ apiBase: message.apiBase }).then(() => sendResponse({ ok: true }));
    return true;
  }

  return false;
});

// First install — seed the API base so popup settings show a value.
chrome.runtime.onInstalled.addListener(async () => {
  const { apiBase } = await chrome.storage.sync.get('apiBase');
  if (!apiBase) await chrome.storage.sync.set({ apiBase: DEFAULT_API_BASE });
});
