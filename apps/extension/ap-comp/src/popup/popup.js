/**
 * ApComp popup.
 *
 *  - "Save job" tab: extracts the active tab's job posting and lets the user
 *    edit fields before sending POST /jobs/capture.
 *  - "Auto-fill" tab: triggers the autofiller on the active tab.
 */

const $ = (id) => document.getElementById(id);

const els = {
  // capture
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

  // settings
  settingsBtn: $('settings-btn'),
  settingsPanel: $('settings-panel'),
  apiBase: $('api-base'),
  webBase: $('web-base'),
  saveSettings: $('save-settings'),

  // tabs
  tabCapture: $('tab-capture'),
  tabAutofill: $('tab-autofill'),
  panelCapture: $('capture-panel'),
  panelAutofill: $('autofill-panel'),

  // autofill
  autofillStatus: $('autofill-status'),
  autofillBtn: $('autofill-btn'),
  autofillResult: $('autofill-result'),
  rRoles: $('r-roles'),
  rOther: $('r-other'),
  rSkipped: $('r-skipped'),
  rDetails: $('r-details'),
};

let lastExtracted = null;

// ---------------- Helpers ----------------

function setStatus(node, text, kind) {
  node.textContent = text;
  node.className = 'ap-status' + (kind ? ` ap-status--${kind}` : '');
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

// ---------------- Tabs ----------------

function switchTab(name) {
  const isCapture = name === 'capture';
  els.tabCapture.classList.toggle('ap-tab--active', isCapture);
  els.tabAutofill.classList.toggle('ap-tab--active', !isCapture);
  els.panelCapture.classList.toggle('hidden', !isCapture);
  els.panelAutofill.classList.toggle('hidden', isCapture);
}

els.tabCapture.addEventListener('click', () => switchTab('capture'));
els.tabAutofill.addEventListener('click', () => switchTab('autofill'));

// ---------------- Capture ----------------

async function extract() {
  setStatus(els.status, 'Extracting…');
  try {
    const tab = await getActiveTab();
    if (!tab?.id) { setStatus(els.status, 'No active tab.', 'err'); return; }

    if (!/^https?:/i.test(tab.url ?? '')) {
      setStatus(els.status, 'This page is not capturable. Enter details manually.', 'err');
      fillForm({ url: tab.url });
      return;
    }

    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, { type: 'APCOMP_EXTRACT' });
    } catch {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['src/extractors/index.js', 'src/autofiller/index.js', 'src/content.js'],
        });
        response = await chrome.tabs.sendMessage(tab.id, { type: 'APCOMP_EXTRACT' });
      } catch (err2) {
        setStatus(els.status, `Couldn't read page: ${err2.message}`, 'err');
        fillForm({ url: tab.url });
        return;
      }
    }

    const extracted = response?.extracted ?? { url: tab.url };
    lastExtracted = extracted;
    fillForm(extracted);

    if (extracted.partial || !extracted.title || !extracted.company) {
      setStatus(els.status, "Couldn't auto-detect everything. Edit fields below.", 'err');
    } else {
      setStatus(els.status, `Detected via ${extracted.extractor ?? 'generic'}. Review and save.`, 'ok');
    }
  } catch (err) {
    setStatus(els.status, `Error: ${err.message}`, 'err');
  }
}

async function save() {
  if (!els.title.value.trim() || !els.company.value.trim() || !els.url.value.trim()) {
    setStatus(els.status, 'Title, company, and URL are required.', 'err');
    return;
  }
  els.saveBtn.disabled = true;
  setStatus(els.status, 'Saving…');
  try {
    const payload = buildPayload();
    const resp = await chrome.runtime.sendMessage({ type: 'APCOMP_CAPTURE', payload });
    if (resp?.ok) {
      setStatus(els.status, `Saved "${resp.job.title}" to ApComp.`, 'ok');
      setTimeout(() => window.close(), 1000);
    } else {
      setStatus(els.status, `Save failed: ${resp?.error ?? 'unknown'}`, 'err');
    }
  } catch (err) {
    setStatus(els.status, `Save failed: ${err.message}`, 'err');
  } finally {
    els.saveBtn.disabled = false;
  }
}

// ---------------- Auto-fill ----------------

async function runAutoFill() {
  els.autofillBtn.disabled = true;
  setStatus(els.autofillStatus, 'Fetching CV and filling form…');
  els.autofillResult.classList.add('hidden');

  try {
    const tab = await getActiveTab();
    if (!tab?.id) {
      setStatus(els.autofillStatus, 'No active tab.', 'err');
      return;
    }
    if (!/^https?:/i.test(tab.url ?? '')) {
      setStatus(els.autofillStatus, 'Auto-fill only works on web pages.', 'err');
      return;
    }

    // The background worker fetches the profile and forwards the call to the
    // active tab's content script.
    const resp = await chrome.runtime.sendMessage({ type: 'APCOMP_TRIGGER_AUTOFILL' });
    if (!resp?.ok) {
      setStatus(els.autofillStatus, `Auto-fill failed: ${resp?.error ?? 'unknown'}`, 'err');
      return;
    }

    const r = resp.result ?? {};
    const idFills = (r.filled ?? []).filter((s) => !s.startsWith('role#') && !s.startsWith('q:')).length;
    const qFills = (r.filled ?? []).filter((s) => s.startsWith('q:')).length;

    els.rRoles.textContent = `${r.rolesFilled ?? 0} / ${r.rolesAttempted ?? 0}`;
    els.rOther.textContent = `${idFills + qFills} (${idFills} identity, ${qFills} hardcoded)`;
    els.rSkipped.textContent = String((r.skipped ?? []).length);
    els.rDetails.textContent = JSON.stringify(r, null, 2);
    els.autofillResult.classList.remove('hidden');

    const ok = (r.errors ?? []).length === 0;
    setStatus(els.autofillStatus, ok ? 'Done — review the form before submitting.' : 'Done with warnings — see details.', ok ? 'ok' : 'err');
  } catch (err) {
    setStatus(els.autofillStatus, `Auto-fill failed: ${err.message}`, 'err');
  } finally {
    els.autofillBtn.disabled = false;
  }
}

// ---------------- Settings ----------------

async function toggleSettings() {
  els.settingsPanel.classList.toggle('hidden');
  if (!els.settingsPanel.classList.contains('hidden')) {
    const { apiBase, webBase } = await chrome.runtime.sendMessage({ type: 'APCOMP_GET_API_BASE' });
    els.apiBase.value = apiBase ?? '';
    els.webBase.value = webBase ?? '';
  }
}

async function saveSettings() {
  const apiBase = els.apiBase.value.trim();
  const webBase = els.webBase.value.trim();
  if (!apiBase) return;
  await chrome.runtime.sendMessage({ type: 'APCOMP_SET_API_BASE', apiBase, webBase });
  setStatus(els.status, 'Settings saved.', 'ok');
  els.settingsPanel.classList.add('hidden');
}

// ---------------- Wiring ----------------

els.saveBtn.addEventListener('click', save);
els.autofillBtn.addEventListener('click', runAutoFill);
els.settingsBtn.addEventListener('click', toggleSettings);
els.saveSettings.addEventListener('click', saveSettings);
document.addEventListener('DOMContentLoaded', extract);
