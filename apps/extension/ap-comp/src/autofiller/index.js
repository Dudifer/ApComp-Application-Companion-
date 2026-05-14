/**
 * ApComp autofiller.
 *
 * Reads the user's CV profile (work experience) plus a small set of hardcoded
 * answers and fills out an application form on the current page. Designed to
 * work on any company's site — no per-vendor selectors. Strategy:
 *
 *   1. Match form fields by their *label text* (and name/id/placeholder/aria
 *      as fallbacks). This survives wildly different markup (Workday's
 *      data-automation-id, Greenhouse's React form, JazzHR's plain HTML).
 *   2. To support multi-role experience sections, find the "Add experience"
 *      button by its visible text, click it as many times as needed, wait
 *      briefly for the new slot to render, then fill each container.
 *   3. Use React-friendly value setters so controlled inputs accept the
 *      written value and fire their onChange handlers.
 *
 * Loaded by manifest.json as a content script alongside extractors/index.js;
 * exposed on window.__apcompAutofiller.
 */
(function (root) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------------- React-safe setters ----------------

  function nativeSet(el, value) {
    // React tracks the previous value on the element; bypass its setter so
    // React's onChange fires.
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
  }

  function setInputValue(el, value) {
    if (!el) return false;
    el.focus();
    nativeSet(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }

  function setSelectValue(el, value) {
    if (!el) return false;
    const opts = Array.from(el.options || []);
    if (!opts.length) return false;
    const want = String(value).trim().toLowerCase();
    let match = opts.find((o) => o.value.toLowerCase() === want)
      || opts.find((o) => (o.textContent || '').trim().toLowerCase() === want)
      || opts.find((o) => (o.textContent || '').trim().toLowerCase().startsWith(want))
      || opts.find((o) => (o.textContent || '').trim().toLowerCase().includes(want));
    if (!match) return false;
    nativeSet(el, match.value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function clickRadioOrCheckbox(container, value) {
    if (!container) return false;
    const want = String(value).trim().toLowerCase();
    // Strategy 1: <input type="radio"> with a matching value or following label text.
    const inputs = container.querySelectorAll('input[type="radio"], input[type="checkbox"]');
    for (const input of inputs) {
      const val = (input.value || '').trim().toLowerCase();
      const labelText = labelTextFor(input).trim().toLowerCase();
      if (val === want || labelText === want || labelText.startsWith(want)) {
        input.click();
        return true;
      }
    }
    // Strategy 2: ARIA radios (Workday-style)
    const ariaRadios = container.querySelectorAll('[role="radio"], [role="option"], [role="menuitem"]');
    for (const el of ariaRadios) {
      const text = (el.textContent || '').trim().toLowerCase();
      if (text === want || text.startsWith(want)) {
        el.click();
        return true;
      }
    }
    return false;
  }

  // ---------------- Label resolution ----------------

  function labelTextFor(field) {
    if (!field) return '';
    if (field.id) {
      const lbl = document.querySelector(`label[for="${cssEscape(field.id)}"]`);
      if (lbl) return cleanText(lbl.textContent);
    }
    // Ancestor <label>
    let p = field.parentElement;
    let hops = 0;
    while (p && hops < 6 && p.tagName !== 'FORM') {
      if (p.tagName === 'LABEL') return cleanText(p.textContent);
      // Common pattern: a wrapping div whose first child holds the label text.
      if (p.firstElementChild && p.firstElementChild !== field) {
        const t = cleanText(p.firstElementChild.textContent);
        if (t && t.length < 120) return t;
      }
      p = p.parentElement;
      hops++;
    }
    return '';
  }

  function cleanText(t) {
    return String(t || '').replace(/\s+/g, ' ').replace(/[\*:]+\s*$/, '').trim();
  }

  function cssEscape(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  // ---------------- Field matching ----------------

  function matchesAny(text, patterns) {
    return patterns.some((p) => p.test(text));
  }

  function describeField(f) {
    const label = labelTextFor(f);
    const name = f.name || '';
    const id = f.id || '';
    const aria = f.getAttribute('aria-label') || '';
    const placeholder = f.placeholder || '';
    const dataAuto = f.getAttribute('data-automation-id') || '';
    const dataTestId = f.getAttribute('data-testid') || '';
    return `${label} | ${name} | ${id} | ${aria} | ${placeholder} | ${dataAuto} | ${dataTestId}`.toLowerCase();
  }

  function findField(patterns, root = document, opts = {}) {
    const fields = root.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([disabled]), textarea:not([disabled]), select:not([disabled])'
    );
    for (const f of fields) {
      if (opts.skipFilled && f.value) continue;
      if (!isVisible(f)) continue;
      const haystack = describeField(f);
      if (matchesAny(haystack, patterns)) return f;
    }
    return null;
  }

  function findAllFields(patterns, root = document) {
    const fields = root.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([disabled]), textarea:not([disabled]), select:not([disabled])'
    );
    const out = [];
    for (const f of fields) {
      const haystack = describeField(f);
      if (matchesAny(haystack, patterns)) out.push(f);
    }
    return out;
  }

  function isVisible(el) {
    if (!el) return false;
    if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  // ---------------- "Add experience" button finder ----------------

  const ADD_BUTTON_PATTERNS = [
    /^\+?\s*add (another |a |an )?(work )?(experience|employment|job|position|role)\b/i,
    /^\+?\s*add (another |a |an )?(work )?history\b/i,
    /^add$/i, // generic, only matched inside an "Experience" section context
  ];

  function findAddExperienceButton(rootHint) {
    const candidates = document.querySelectorAll('button, a, [role="button"], input[type="button"]');
    for (const b of candidates) {
      if (!isVisible(b)) continue;
      const text = cleanText(b.textContent || b.value || '');
      if (!text) continue;
      if (matchesAny(text.toLowerCase(), [
        /^\+?\s*add (another |a |an )?(work )?(experience|employment|job|position|role)/i,
        /^\+?\s*add (another |a |an )?(work )?history/i,
      ])) {
        return b;
      }
    }
    // Last-ditch: a plain "Add" inside something labelled "Experience"
    if (rootHint) {
      for (const b of rootHint.querySelectorAll('button, a, [role="button"]')) {
        if (!isVisible(b)) continue;
        const text = cleanText(b.textContent || '').toLowerCase();
        if (/^\+?\s*add$/i.test(text)) return b;
      }
    }
    return null;
  }

  // ---------------- Date parsing ----------------

  // Convert various CV date formats to {year, month (1-12), iso 'YYYY-MM', monthName}.
  function parseDate(input) {
    if (!input) return null;
    const s = String(input).trim();
    if (/^present$|^current$|^now$/i.test(s)) return { present: true };

    // YYYY-MM or YYYY-MM-DD
    let m = s.match(/^(\d{4})[-/](\d{1,2})/);
    if (m) return makeDate(+m[1], +m[2]);

    // MM/YYYY or M/YYYY
    m = s.match(/^(\d{1,2})[-/](\d{4})$/);
    if (m) return makeDate(+m[2], +m[1]);

    // Month YYYY  ("April 2023", "Apr 2023")
    m = s.match(/^([A-Za-z]+)\s+(\d{4})$/);
    if (m) {
      const idx = monthIndex(m[1]);
      if (idx !== -1) return makeDate(+m[2], idx + 1);
    }

    // Just a year
    m = s.match(/^(\d{4})$/);
    if (m) return makeDate(+m[1], 1);

    return null;
  }

  const MONTHS = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ];

  function monthIndex(name) {
    const lower = name.toLowerCase();
    let idx = MONTHS.findIndex((m) => m === lower);
    if (idx === -1) idx = MONTHS.findIndex((m) => m.startsWith(lower));
    return idx;
  }

  function makeDate(year, month) {
    const mm = String(month).padStart(2, '0');
    return {
      year: String(year),
      month: mm,
      monthNum: month,
      monthName: MONTHS[month - 1],
      iso: `${year}-${mm}`,
      slash: `${mm}/${year}`,
      present: false,
    };
  }

  /**
   * Set a date field. Tries multiple formats since we don't know which the
   * site expects (HTML5 date input wants YYYY-MM-DD, plain text might want
   * MM/YYYY, etc.). For dropdown month+year combos we recurse into the
   * container.
   */
  function setDateField(el, dateObj) {
    if (!el || !dateObj || dateObj.present) return false;
    const type = (el.type || '').toLowerCase();
    if (type === 'month') return setInputValue(el, dateObj.iso);
    if (type === 'date') return setInputValue(el, `${dateObj.iso}-01`);
    // Plain text — try MM/YYYY which is the most common.
    return setInputValue(el, dateObj.slash);
  }

  // ---------------- Experience container detection ----------------

  /**
   * An "experience entry" is a DOM region containing fields for a single role
   * (title, company, dates). We anchor on the company/title field and walk up
   * to a container that holds *both*.
   */
  function findExperienceContainers() {
    const titlePatterns = [
      /\b(job title|position title|role title|title|position|role)\b/i,
    ];
    const companyPatterns = [
      /\b(company|employer|organization|organisation)\b/i,
    ];

    const titleFields = findAllFields(titlePatterns);
    const containers = [];
    const seen = new Set();

    for (const t of titleFields) {
      let p = t.parentElement;
      for (let i = 0; i < 8 && p && p.tagName !== 'FORM' && p.tagName !== 'BODY'; i++) {
        const hasCompany = Array.from(
          p.querySelectorAll('input:not([type="hidden"]), textarea, select')
        ).some((f) => matchesAny(describeField(f), companyPatterns));
        if (hasCompany) {
          if (!seen.has(p)) {
            seen.add(p);
            containers.push(p);
          }
          break;
        }
        p = p.parentElement;
      }
    }
    return containers;
  }

  // ---------------- Filling one role ----------------

  function fillRole(role, container) {
    const filled = [];
    const skipped = [];

    const titleField = findField([/\b(job title|position title|role title|^title$|^position$|^role$)\b/i], container)
      || findField([/\btitle\b|\bposition\b|\brole\b/i], container);
    if (titleField && setInputValue(titleField, role.title)) filled.push('title');
    else skipped.push('title');

    const companyField = findField([/\b(company|employer|organi[sz]ation)\b/i], container);
    if (companyField && setInputValue(companyField, role.company)) filled.push('company');
    else skipped.push('company');

    const startDate = parseDate(role.startDate);
    const endDate = parseDate(role.endDate);

    if (startDate) {
      const startField = findField([/\bstart(ed|ing)?\b|\bfrom\b/i], container);
      if (startField && setDateField(startField, startDate)) filled.push('startDate');
      else skipped.push('startDate');
    }

    if (endDate && !endDate.present) {
      const endField = findField([/\bend(ed|ing)?\b|\bto\b|\buntil\b/i], container);
      if (endField && setDateField(endField, endDate)) filled.push('endDate');
      else skipped.push('endDate');
    } else if (!role.endDate || /present|current|now/i.test(String(role.endDate))) {
      // Try a "currently work here" checkbox.
      const current = findField(
        [/\bcurrent(ly)?\b|\bpresent\b|\bi (still |currently )?work (here|at this company)/i],
        container,
      );
      if (current && current.type === 'checkbox' && !current.checked) {
        current.click();
        filled.push('currentlyWorkHere');
      }
    }

    const descField = findField(
      [/\b(description|responsibilities|details|duties|what you did|accomplishments)\b/i],
      container,
    );
    if (descField && setInputValue(descField, role.description || buildDescriptionFromRole(role))) {
      filled.push('description');
    } else if (role.description) {
      skipped.push('description');
    }

    return { filled, skipped };
  }

  function buildDescriptionFromRole(role) {
    const techs = (role.technologies ?? []).join(', ');
    const pieces = [role.description, techs ? `Technologies: ${techs}` : null].filter(Boolean);
    return pieces.join('\n\n');
  }

  // ---------------- Top-level identity fields ----------------

  function fillIdentity(profile, results) {
    const [firstName, ...rest] = (profile.name || '').split(' ');
    const lastName = rest.join(' ');

    const tryFill = (label, patterns, value) => {
      if (!value) return;
      const el = findField(patterns, document, { skipFilled: true });
      if (el && setInputValue(el, value)) results.filled.push(label);
    };

    tryFill('firstName', [/\b(first ?name|given name|forename|f\.?\s*name)\b/i], firstName);
    tryFill('lastName', [/\b(last ?name|surname|family name|l\.?\s*name)\b/i], lastName);
    tryFill('fullName', [/^name$|\bfull name\b/i], profile.name);
    tryFill('email', [/\bemail\b|\be-?mail address\b/i], profile.email);
  }

  // ---------------- Hardcoded yes/no questions ----------------
  // Each entry: { pattern (matches the question text), answer ('Yes'|'No'|<string>) }
  // We err on the side of caution — uncertain questions are left blank.
  const HARDCODED_QA = [
    { pattern: /\b(18|17|21|16) ?(years old|years of age)|\bat least \d+\b.*\bage\b|\bof legal age\b/i, answer: 'Yes' },
    { pattern: /\bauthori[sz]ed to work\b|\blegally (allowed|able|eligible) to work\b|\blegal right to work\b|\beligible to work\b/i, answer: 'Yes' },
    { pattern: /\b(provide|provide the )?(necessary )?documentation .*(work|employment)\b|\b(u\.?s\.? )?citizen, ?(permanent resident|foreign national)/i, answer: 'Yes' },
    { pattern: /\b(require|need)\b.*\b(visa|h-?1b|sponsorship)\b|\bvisa sponsorship\b.*\bnow\b|\b(opt|cpt|h-?1b)\b/i, answer: 'No' },
    { pattern: /\bbackground check\b|\bdrug (screen|test)\b|\bcriminal background\b/i, answer: 'Yes' },
    { pattern: /\b(available to work|able to work)\b.*\bhours\b|\b9 ?am.?-?5 ?pm\b|\bregular (business )?hours\b/i, answer: 'Yes' },
    { pattern: /\bwilling to relocate\b|\bopen to relocation\b/i, answer: 'Yes' },
    { pattern: /\bcommute\b|\babout to commute\b|\bwithin commuting distance\b/i, answer: 'Yes' },
  ];

  function answerHardcodedQuestions(results) {
    // Application pages typically render each question as a labelled group of
    // radios. We scan all "fieldset"-like containers and try to match the
    // question text.
    const QUESTION_CONTAINERS = 'fieldset, [role="radiogroup"], div, section, li';
    const seen = new WeakSet();

    document.querySelectorAll(QUESTION_CONTAINERS).forEach((container) => {
      if (seen.has(container)) return;
      const radios = container.querySelectorAll('input[type="radio"], [role="radio"]');
      if (radios.length < 2 || radios.length > 12) return;
      // Already answered?
      const someChecked = Array.from(radios).some(
        (r) => r.checked || r.getAttribute('aria-checked') === 'true',
      );
      if (someChecked) return;

      const questionText = cleanText(container.textContent).toLowerCase().slice(0, 300);
      for (const { pattern, answer } of HARDCODED_QA) {
        if (pattern.test(questionText)) {
          if (clickRadioOrCheckbox(container, answer)) {
            seen.add(container);
            results.filled.push(`q:${pattern.source.slice(0, 30)}=${answer}`);
          }
          break;
        }
      }
    });
  }

  // ---------------- Public API ----------------

  async function autoFill(profile, opts = {}) {
    const results = {
      rolesFilled: 0,
      rolesAttempted: 0,
      filled: [],
      skipped: [],
      errors: [],
    };

    if (!profile) {
      results.errors.push('No CV profile available.');
      return results;
    }

    // 1. Top-level identity
    try { fillIdentity(profile, results); } catch (err) {
      results.errors.push(`identity: ${err.message}`);
    }

    // 2. Hardcoded yes/no
    try { answerHardcodedQuestions(results); } catch (err) {
      results.errors.push(`hardcoded: ${err.message}`);
    }

    // 3. Work experience
    const roles = profile.roles ?? [];
    if (roles.length) {
      results.rolesAttempted = roles.length;

      let containers = findExperienceContainers();
      const needed = roles.length - containers.length;
      if (needed > 0) {
        const addBtn = findAddExperienceButton();
        if (addBtn) {
          for (let i = 0; i < needed; i++) {
            addBtn.click();
            await sleep(500); // give the framework time to render the new slot
          }
          containers = findExperienceContainers();
        } else if (containers.length === 0) {
          results.errors.push("Couldn't find any work-experience fields or an 'Add experience' button.");
        } else {
          results.errors.push(
            `Need ${needed} more experience slot(s) but couldn't find an 'Add experience' button — only filling ${containers.length}.`,
          );
        }
      }

      for (let i = 0; i < Math.min(roles.length, containers.length); i++) {
        try {
          const { filled, skipped } = fillRole(roles[i], containers[i]);
          results.rolesFilled++;
          results.filled.push(`role#${i + 1}:${filled.join(',')}`);
          if (skipped.length) results.skipped.push(`role#${i + 1}:${skipped.join(',')}`);
        } catch (err) {
          results.errors.push(`role#${i + 1}: ${err.message}`);
        }
      }
    }

    return results;
  }

  function looksLikeApplicationPage() {
    const fields = document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select',
    );
    if (fields.length >= 5) return true;
    if (findAddExperienceButton()) return true;
    return false;
  }

  root.__apcompAutofiller = {
    autoFill,
    looksLikeApplicationPage,
    // exposed for unit testing
    _internals: {
      parseDate,
      findField,
      findExperienceContainers,
      findAddExperienceButton,
      setInputValue,
      setSelectValue,
      labelTextFor,
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
