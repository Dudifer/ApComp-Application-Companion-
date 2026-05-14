/**
 * ApComp DOM extractors.
 *
 * Each extractor returns a partial `CapturedJobInput` (see
 * `packages/types/src/job.ts`) or `null` if the page doesn't look like a job
 * posting it knows how to handle.
 *
 * `pickExtractor(host)` chooses the first matching site-specific extractor and
 * falls back to the generic one (JSON-LD / Open Graph / heuristics).
 *
 * This module is loaded inline by content.js — it intentionally avoids ES
 * module syntax so it works in a plain MV3 content script.
 */
(function (root) {
  const trim = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : undefined);
  const textOf = (el) => (el ? trim(el.textContent) : undefined);

  /** Try a list of selectors; return text of the first match. */
  function pick(selectors, root = document) {
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      const t = textOf(el);
      if (t) return t;
    }
    return undefined;
  }

  /** Reads `content` attribute (for meta tags); falls back to textContent. */
  function pickAttr(selectors, attr) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const v = el.getAttribute(attr) || el.textContent;
        const t = trim(v);
        if (t) return t;
      }
    }
    return undefined;
  }

  function prettifyHandle(handle) {
    try {
      const decoded = decodeURIComponent(handle);
      const cleaned = decoded.replace(/[-_]+/g, ' ').trim();
      return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
    } catch (_) {
      return handle;
    }
  }

  function findJsonLd() {
    const blocks = document.querySelectorAll('script[type="application/ld+json"]');
    for (const b of blocks) {
      try {
        const parsed = JSON.parse(b.textContent);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          if (!item) continue;
          if (item['@type'] === 'JobPosting') return item;
          if (Array.isArray(item['@graph'])) {
            const jp = item['@graph'].find((x) => x?.['@type'] === 'JobPosting');
            if (jp) return jp;
          }
        }
      } catch (_) {
        /* malformed JSON-LD — skip */
      }
    }
    return null;
  }

  function parseSalary(input) {
    if (!input) return {};
    const s = String(input).replace(/\s+/g, ' ');
    const range = s.match(/\$?\s?(\d{2,3})[,.]?(\d{3})?\s*[kK]?\s*[-–to]+\s*\$?\s?(\d{2,3})[,.]?(\d{3})?\s*[kK]?/);
    if (range) {
      const hasK = /[kK]/.test(s);
      const mk = (a, b) => {
        const n = parseInt((a || '') + (b || ''), 10);
        return hasK || !b ? n * 1000 : n;
      };
      const min = mk(range[1], range[2]);
      const max = mk(range[3], range[4]);
      return { salaryMin: min, salaryMax: max, salaryCurrency: /€/.test(s) ? 'EUR' : 'USD' };
    }
    return {};
  }

  function stripHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || '';
  }

  // --------- Generic (JSON-LD + meta tags) ---------
  function extractGeneric() {
    const ld = findJsonLd();
    if (ld) {
      const orgName = typeof ld.hiringOrganization === 'object'
        ? ld.hiringOrganization?.name
        : ld.hiringOrganization;
      const loc = (() => {
        const l = Array.isArray(ld.jobLocation) ? ld.jobLocation[0] : ld.jobLocation;
        const a = l?.address;
        if (!a) return undefined;
        return [a.addressLocality, a.addressRegion, a.addressCountry].filter(Boolean).join(', ');
      })();
      const salary = (() => {
        const base = ld.baseSalary?.value;
        if (!base) return {};
        const min = typeof base === 'object' ? base.minValue ?? base.value : base;
        const max = typeof base === 'object' ? base.maxValue ?? base.value : base;
        return {
          salaryMin: typeof min === 'number' ? min : Number(min) || undefined,
          salaryMax: typeof max === 'number' ? max : Number(max) || undefined,
          salaryCurrency: ld.baseSalary?.currency,
          salaryPeriod: base?.unitText,
        };
      })();

      return {
        title: trim(ld.title),
        company: trim(orgName),
        description: trim(typeof ld.description === 'string' ? stripHtml(ld.description) : ''),
        location: trim(loc),
        remote: /(true|telecommute|remote)/i.test(String(ld.jobLocationType ?? '')),
        employmentType: Array.isArray(ld.employmentType) ? ld.employmentType.join(', ') : ld.employmentType,
        postedAt: ld.datePosted,
        extractor: 'jsonld',
        ...salary,
      };
    }

    // Fall back to OpenGraph + heuristics.
    const ogTitle = pickAttr(['meta[property="og:title"]'], 'content');
    const ogSite = pickAttr(['meta[property="og:site_name"]'], 'content');
    const h1 = textOf(document.querySelector('h1'));
    const bodyText = trim(document.body?.innerText)?.slice(0, 8000);

    return {
      title: trim(ogTitle) ?? h1,
      company: trim(ogSite),
      description: bodyText,
      extractor: 'generic-fallback',
    };
  }

  // --------- LinkedIn ---------
  function extractLinkedIn() {
    if (!/linkedin\.com/.test(location.host)) return null;
    if (!/\/jobs\/view\//.test(location.pathname)) return null;

    const title = pick([
      '.top-card-layout__title',
      '.job-details-jobs-unified-top-card__job-title',
      'h1.t-24',
    ]);
    const company = pick([
      '.topcard__org-name-link',
      '.job-details-jobs-unified-top-card__company-name a',
      '.job-details-jobs-unified-top-card__company-name',
    ]);
    const location_ = pick([
      '.topcard__flavor--bullet',
      '.job-details-jobs-unified-top-card__bullet',
    ]);
    const description = pick([
      '.show-more-less-html__markup',
      '#job-details',
      '.jobs-description__content',
    ]);
    const salaryText = pick([
      '.compensation__salary',
      '.job-details-jobs-unified-top-card__job-insight span',
    ]);

    if (!title && !company) return null;

    return {
      title,
      company,
      location: location_,
      description,
      remote: /remote/i.test((location_ ?? '') + ' ' + (title ?? '')),
      extractor: 'linkedin',
      ...parseSalary(salaryText),
    };
  }

  // --------- Indeed ---------
  function extractIndeed() {
    if (!/indeed\.com/.test(location.host)) return null;
    const title = pick([
      '[data-testid="jobsearch-JobInfoHeader-title"]',
      '.jobsearch-JobInfoHeader-title',
      'h1.jobsearch-JobInfoHeader-title',
    ]);
    const company = pick([
      '[data-testid="inlineHeader-companyName"] a',
      '[data-testid="inlineHeader-companyName"]',
      '.jobsearch-CompanyInfoContainer a',
    ]);
    const location_ = pick([
      '[data-testid="inlineHeader-companyLocation"]',
      '.jobsearch-JobInfoHeader-subtitle div',
    ]);
    const description = pick([
      '#jobDescriptionText',
      '.jobsearch-jobDescriptionText',
    ]);
    const salaryText = pick(['#salaryInfoAndJobType .css-19j1a75', '[data-testid="attribute_snippet_compensation"]']);

    if (!title && !company) return null;
    return {
      title, company, location: location_, description,
      remote: /remote/i.test((location_ ?? '')),
      extractor: 'indeed',
      ...parseSalary(salaryText),
    };
  }

  // --------- Greenhouse ---------
  // Handles both the legacy boards.greenhouse.io layout AND the modern
  // job-boards.greenhouse.io/<company>/jobs/<id> layout which uses
  // "section-header" classes and doesn't expose a stable company element.
  function extractGreenhouse() {
    if (!/greenhouse\.io/.test(location.host)) return null;

    const title = pick([
      // modern job-boards layout
      'h1.section-header--large',
      'h1[class*="section-header"]',
      // legacy
      '.app-title',
      'h1.app-title',
      '#header h1',
      // last-resort
      'h1',
    ]);

    // Company name on modern Greenhouse pages comes from the URL path:
    // /<company-handle>/jobs/<id>
    const pathMatch = location.pathname.match(/^\/([^\/]+)\/jobs?\b/i);
    const fromPath = pathMatch ? prettifyHandle(pathMatch[1]) : undefined;

    const company = pick(['.company-name', '#header .company-name'])
      || pickAttr(['meta[property="og:site_name"]'], 'content')
      || fromPath;

    const location_ = pick([
      'h2.section-header--medium',
      '.section-header--medium',
      '.location',
      '#header .location',
      '[class*="job-post-location"]',
    ]);

    const description = pick([
      '#content',
      '.job__description',
      '.body--medium',
      '.body',
      '[class*="job-description"]',
      'main',
    ]);

    if (!title) return null;
    return { title, company, location: location_, description, extractor: 'greenhouse' };
  }

  // --------- Lever ---------
  function extractLever() {
    if (!/jobs\.lever\.co|lever\.co/.test(location.host)) return null;
    const title = pick(['.posting-headline h2', '.posting-headline h1', 'h2']);
    const company = (() => {
      const og = pickAttr(['meta[property="og:site_name"]'], 'content');
      if (og) return og;
      const m = location.pathname.match(/^\/([^\/]+)/);
      return m ? prettifyHandle(m[1]) : undefined;
    })();
    const location_ = pick(['.posting-categories .location', '.location']);
    const employmentType = pick(['.posting-categories .commitment']);
    const description = pick(['.posting-page .section-wrapper', '[data-qa="job-description"]', '.section.page-centered']);
    if (!title) return null;
    return { title, company, location: location_, employmentType, description, extractor: 'lever' };
  }

  // --------- Workday ---------
  function extractWorkday() {
    if (!/workday(jobs)?\.com|myworkdayjobs\.com/.test(location.host)) return null;
    const title = pick(['[data-automation-id="jobPostingHeader"]', 'h1', 'h2']);
    const company = (() => {
      const host = location.host.split('.')[0];
      return host ? prettifyHandle(host) : undefined;
    })();
    const location_ = pick(['[data-automation-id="locations"]', '[data-automation-id="jobPostingLocation"]']);
    const description = pick(['[data-automation-id="jobPostingDescription"]', '.WLLO']);
    if (!title) return null;
    return { title, company, location: location_, description, extractor: 'workday' };
  }

  // --------- Ashby ---------
  function extractAshby() {
    if (!/jobs\.ashbyhq\.com|ashbyhq\.com/.test(location.host)) return null;
    const title = pick(['h1', '[class*="_title_"]']);
    const description = pick(['[class*="_descriptionText_"]', '[class*="descriptionText"]', 'main']);
    const m = location.pathname.match(/^\/([^\/]+)/);
    const company = m ? prettifyHandle(m[1]) : undefined;
    if (!title) return null;
    return { title, company, description, extractor: 'ashby' };
  }

  const EXTRACTORS = [extractLinkedIn, extractIndeed, extractGreenhouse, extractLever, extractWorkday, extractAshby];

  /** Run extractors in order; return the first non-null hit, then merge with JSON-LD as backfill. */
  function run() {
    const url = location.href;
    const sourceHost = location.host;

    let result = null;
    for (const fn of EXTRACTORS) {
      try {
        result = fn();
        if (result) break;
      } catch (err) {
        console.warn('[apcomp] extractor crashed:', err);
      }
    }

    let fallback;
    try { fallback = extractGeneric(); } catch (_) { fallback = null; }

    const merged = {
      url,
      sourceHost,
      ...(fallback || {}),
      ...(result || {}),
    };

    if (!merged.title || !merged.company) return { url, sourceHost, partial: true, ...merged };

    return merged;
  }

  root.__apcompExtractors = { run, extractGeneric };
})(typeof window !== 'undefined' ? window : globalThis);
