# ApComp Chrome Extension

A Manifest V3 Chrome extension that captures the job posting on the active tab
and saves it to your ApComp dashboard.

## Install (dev)

1. Run the API: from the repo root, `pnpm --filter @apcomp/api dev` (must be on `http://localhost:3000`).
2. In Chrome: `chrome://extensions` → toggle **Developer mode** → **Load unpacked** → select this folder (`apps/extension/ap-comp`).
3. Pin the extension to the toolbar.

## How to use

- Open any job posting page (LinkedIn, Indeed, Greenhouse, Lever, Workday, Ashby, or most company career pages).
- Either click the floating **Save to ApComp** button in the bottom-right, or click the extension icon → **Save this job**.
- The popup shows the extracted fields; edit if needed and click **Save**.
- The job appears in the **Recommended Job Postings** row on the dashboard with `source: manual`.

## Files

- `manifest.json` — MV3 manifest.
- `src/background.js` — service worker; handles messages from the content script and popup, posts to the API.
- `src/content.js` — injects the floating button and runs extractors on the page.
- `src/extractors/*` — per-site DOM heuristics. `generic.js` is the fallback (JSON-LD / schema.org / meta tags).
- `src/popup/*` — toolbar popup with editable extracted fields.
- `src/floating-button.css` — styles for the in-page button.

## API contract

POST `http://localhost:3000/jobs/capture` with a `CapturedJobInput` body (see `packages/types/src/job.ts`).
The backend assigns the job to the dev user and stores it as a `SavedJob` with `source: 'manual'`.
