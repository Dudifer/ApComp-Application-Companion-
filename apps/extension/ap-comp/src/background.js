/**
 * ApComp extension — background service worker (MV3).
 *
 * Responsibilities:
 *  - Provide a single message router between the content script, the popup,
 *    and the ApComp API.
 *  - Persist the API base URL in chrome.storage so the user can point at a
 *    deployed instance later.
 *  - Echo helpful badge state when a capture / auto-fill succeeds / fails.
 */

const DEFAULT_API_BASE = 'http://localhost:3000';
const DEFAULT_WEB_BASE = 'http://localhost:5173';

async function getApiBase() {
  const { apiBase } = await chrome.storage.sync.get({ apiBase: DEFAULT_API_BASE });
  return apiBase || DEFAULT_API_BASE;
}

async function getWebBase() {
  const { webBase } = await chrome.storage.sync.get({ webBase: DEFAULT_WEB_BASE });
  return webBase || DEFAULT_WEB_BASE;
}

/**
 * Reads the Clerk session token from the web app's __session cookie.
 * Requires the "cookies" permission and the web app URL in host_permissions.
 */
async function getSessionToken() {
  const webBase = await getWebBase();
  try {
    const cookie = await chrome.cookies.get({ url: webBase, name: '__session' });
    return cookie?.value ?? null;
  } catch {
    return null;
  }
}

async function authHeaders() {
  const token = await getSessionToken();
  if (!token) throw new Error('Not signed in to ApComp — open the app and log in first.');
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
}

async function postCapture(payload) {
  const base = await getApiBase();
  const res = await fetch(`${base}/jobs/capture`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

async function getCvProfile() {
  const base = await getApiBase();
  const res = await fetch(`${base}/resume/profile`, {
    headers: await authHeaders(),
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
    /* tab may have closed already */
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
    return true;
  }

  if (message.type === 'APCOMP_GET_PROFILE') {
    getCvProfile()
      .then((profile) => sendResponse({ ok: true, profile }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === 'APCOMP_GET_API_BASE') {
    Promise.all([getApiBase(), getWebBase()]).then(([apiBase, webBase]) => sendResponse({ apiBase, webBase }));
    return true;
  }

  if (message.type === 'APCOMP_SET_API_BASE') {
    chrome.storage.sync.set({ apiBase: message.apiBase, webBase: message.webBase }).then(() => sendResponse({ ok: true }));
    return true;
  }

  // Forward an auto-fill trigger from the popup to the active tab's content
  // script. The content script does the actual DOM manipulation since it's
  // the only place with page-DOM access.
  if (message.type === 'APCOMP_TRIGGER_AUTOFILL') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) throw new Error('No active tab.');
        const profile = await getCvProfile();
        const resp = await chrome.tabs.sendMessage(tab.id, {
          type: 'APCOMP_AUTOFILL',
          profile,
        });
        if (resp?.ok) flashBadge(tab.id, '✓', '#2d7d4f');
        else flashBadge(tab.id, '!', '#c9622f');
        sendResponse(resp ?? { ok: false, error: 'No response from content script' });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  return false;
});

chrome.runtime.onInstalled.addListener(async () => {
  const { apiBase } = await chrome.storage.sync.get('apiBase');
  if (!apiBase) await chrome.storage.sync.set({ apiBase: DEFAULT_API_BASE });
});
