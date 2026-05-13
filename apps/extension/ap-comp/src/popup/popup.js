/**
 * ApComp popup.
 *
 * Asks the content script for the current page's extracted job, lets the user
 * edit the fields, and sends the result to the background worker for posting
 * to the API.
 */

const $ = (id) => document.getElementById(id);
const els = {
  status: $('status'),
  title: $('f-title'),
  company: $('f-company'),
  url: $('f-url'),
  location: $('f-location'),
  salaryMin: $('f-salary-min'),
  salaryMax: $('f-salary-max'),
  remote: $('f-remote'),
  description: $('f-description'),
  saveBtn: $('save-btn'),
  settingsBtn: $('settings-btn'),
  settingsPanel: $('settings-panel'),
  apiBase: $('api-base'),
  saveSettings: $('save-settings'),
};

let lastExtracted = null;

function setStatus(text, kind) {
  els.status.textContent = text;
  els.status.className = 'ap-status' + (kind ? ` ap-status--${kind}` : '');
}

function fillForm(data) {
  els.title.value = data?.title ?? '';
  els.company.value = data?.company ?? '';
  els.url.value = data?.url ?? '';
  els.location.value = data?.location ?? '';
  els.salaryMin.value = data?.salaryMin ?? '';
  els.salaryMax.value = data?.salaryMax ?? '';
  els.remote.checked = !!data?.remote;
  els.description.value = data?.description ?? '';
}

function buildPayload() {
  return {
    title: els.title.value.trim(),
    company: els.company.value.trim(),
    url: els.url.value.trim(),
    location: els.location.value.trim() || undefined,
    remote: els.remote.checked,
    salaryMin: els.salaryMin.value ? Number(els.salaryMin.value) : undefined,
    salaryMax: els.salaryMax.value ? Number(els.salaryMax.value) : undefined,
    description: els.description.value.trim() || undefined,
    sourceHost: lastExtracted?.sourceHost,
    extractor: lastExtracted?.extractor ?? 'popup-manual',
  };
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function extract() {
  setStatus('Extracting…');
  try {
    const tab = await getActiveTab();
    if (!tab?.id) {
      setStatus('No active tab.', 'err');
      return;
    }

    // Skip extension/chrome:// pages — the content script can't run there.
    if (!/^https?:/i.test(tab.url ?? '')) {
      setStatus('This page is not capturable. Enter details manually.', 'err');
      fillForm({ url: tab.url });
      return;
    }

    // Ask the content script.
    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, { type: 'APCOMP_EXTRACT' });
    } catch (err) {
      // Content script may not have loaded — inject and retry.
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['src/extractors/index.js', 'src/content.js'],
        });
        response = await chrome.tabs.sendMessage(tab.id, { type: 'APCOMP_EXTRACT' });
      } catch (err2) {
        setStatus(`Couldn't read page: ${err2.message}`, 'err');
        fillForm({ url: tab.url });
        return;
      }
    }

    const extracted = response?.extracted ?? { url: tab.url };
    lastExtracted = extracted;
    fillForm(extracted);

    if (extracted.partial || !extracted.title || !extracted.company) {
      setStatus('Couldn\'t auto-detect everything. Edit fields below.', 'err');
    } else {
      setStatus(`Detected via ${extracted.extractor ?? 'generic'}. Review and save.`, 'ok');
    }
  } catch (err) {
    setStatus(`Error: ${err.message}`, 'err');
  }
}

async function save() {
  if (!els.title.value.trim() || !els.company.value.trim() || !els.url.value.trim()) {
    setStatus('Title, company, and URL are required.', 'err');
    return;
  }
  els.saveBtn.disabled = true;
  setStatus('Saving…');
  try {
    const payload = buildPayload();
    const resp = await chrome.runtime.sendMessage({ type: 'APCOMP_CAPTURE', payload });
    if (resp?.ok) {
      setStatus(`Saved "${resp.job.title}" to ApComp.`, 'ok');
      setTimeout(() => window.close(), 1000);
    } else {
      setStatus(`Save failed: ${resp?.error ?? 'unknown'}`, 'err');
    }
  } catch (err) {
    setStatus(`Save failed: ${err.message}`, 'err');
  } finally {
    els.saveBtn.disabled = false;
  }
}

async function toggleSettings() {
  els.settingsPanel.classList.toggle('hidden');
  if (!els.settingsPanel.classList.contains('hidden')) {
    const { apiBase } = await chrome.runtime.sendMessage({ type: 'APCOMP_GET_API_BASE' });
    els.apiBase.value = apiBase ?? '';
  }
}

async function saveSettings() {
  const apiBase = els.apiBase.value.trim();
  if (!apiBase) return;
  await chrome.runtime.sendMessage({ type: 'APCOMP_SET_API_BASE', apiBase });
  setStatus('API base saved.', 'ok');
  els.settingsPanel.classList.add('hidden');
}

els.saveBtn.addEventListener('click', save);
els.settingsBtn.addEventListener('click', toggleSettings);
els.saveSettings.addEventListener('click', saveSettings);
document.addEventListener('DOMContentLoaded', extract);
