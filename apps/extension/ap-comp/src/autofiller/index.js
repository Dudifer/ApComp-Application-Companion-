/**
 * ApComp autofiller (v0.3).
 *
 * Fills work-experience, education, and identity fields on any application
 * form. Designed to work on:
 *   - Plain HTML forms (JazzHR / applytojob.com, custom sites)
 *   - Material UI floating-label forms
 *   - Workday "My Experience" pages (single bare "Add" button per section)
 *   - Multi-input date pickers (MM / DD / YYYY split boxes)
 *
 * Strategy:
 *   1. Identify section headers ("Work Experience", "Education") and look for
 *      an Add button inside each section. The button text can be plain "Add",
 *      "Add another experience", or similar.
 *   2. Click Add as many times as needed so we have one container per CV item,
 *      waiting briefly for SPAs to render the new slot.
 *   3. Walk each container, matching fields by their *resolved label*. Label
 *      resolution covers: `<label for>`, ancestor `<label>`, sibling `<label>`,
 *      Material UI floating labels (`.MuiInputLabel-root`), aria-labelledby,
 *      legend (fieldset), the wrapping div's first text node, name/id/
 *      placeholder/aria-label/data-automation-id fallbacks.
 *   4. Use React-safe value setters so controlled inputs accept the value.
 *
 * Loaded by manifest.json as a content script. Exposed on window.__apcompAutofiller.
 */
(function (root) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ==================================================================
  // React-safe value setters
  // ==================================================================

  function nativeSet(el, value) {
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
    if (el.tagName === 'SELECT') return setSelectValue(el, value);
    try { el.focus(); } catch (_) {}
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
    const inputs = container.querySelectorAll('input[type="radio"], input[type="checkbox"]');
    for (const input of inputs) {
      const val = (input.value || '').trim().toLowerCase();
      const labelText = labelTextFor(input).trim().toLowerCase();
      if (val === want || labelText === want || labelText.startsWith(want)) {
        input.click();
        return true;
      }
    }
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

  // ==================================================================
  // Label resolution — significantly extended in v0.3
  // ==================================================================

  function labelTextFor(field) {
    if (!field) return '';

    // 1. aria-labelledby
    const lblIds = field.getAttribute('aria-labelledby');
    if (lblIds) {
      const parts = lblIds.split(/\s+/).map((id) => {
        const lbl = document.getElementById(id);
        return lbl ? cleanText(lbl.textContent) : '';
      }).filter(Boolean);
      if (parts.length) return parts.join(' ');
    }

    // 2. <label for="id">
    if (field.id) {
      const lbl = document.querySelector(`label[for="${cssEscape(field.id)}"]`);
      if (lbl) return cleanText(lbl.textContent);
    }

    // 3. Ancestor <label>
    let p = field.parentElement;
    let hops = 0;
    while (p && hops < 8 && p.tagName !== 'FORM' && p.tagName !== 'BODY') {
      if (p.tagName === 'LABEL') return cleanText(p.textContent);
      hops++;
      p = p.parentElement;
    }

    // 4. Material UI / Material Web floating label: sibling label inside the
    //    same wrapper. Look up to 3 levels for a `.MuiInputLabel-root`,
    //    `[class*="floating-label"]`, or a `<label>` sibling.
    p = field.parentElement;
    hops = 0;
    while (p && hops < 4 && p.tagName !== 'FORM' && p.tagName !== 'BODY') {
      const lbl = p.querySelector(
        'label, .MuiInputLabel-root, .MuiFormLabel-root, [class*="floating-label"], [class*="FormLabel"], [class*="InputLabel"]'
      );
      if (lbl && !lbl.contains(field)) {
        const t = cleanText(lbl.textContent);
        if (t) return t;
      }
      hops++;
      p = p.parentElement;
    }

    // 5. <fieldset><legend> — used for grouped questions.
    const fs = field.closest('fieldset');
    if (fs) {
      const legend = fs.querySelector(':scope > legend');
      if (legend) return cleanText(legend.textContent);
    }

    // 6. Preceding sibling that looks like a label (small chunk of text).
    let prev = field.previousElementSibling;
    while (prev) {
      if (/^(LABEL|SPAN|DIV|P|H[1-6])$/.test(prev.tagName)) {
        const t = cleanText(prev.textContent);
        if (t && t.length < 120) return t;
      }
      prev = prev.previousElementSibling;
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

  // ==================================================================
  // Field matching
  // ==================================================================

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

  function fieldsIn(root) {
    return root.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([disabled]), textarea:not([disabled]), select:not([disabled])'
    );
  }

  function findField(patterns, root = document, opts = {}) {
    for (const f of fieldsIn(root)) {
      if (opts.skipFilled && f.value) continue;
      if (!isVisible(f)) continue;
      const haystack = describeField(f);
      if (matchesAny(haystack, patterns)) return f;
    }
    return null;
  }

  function findAllFields(patterns, root = document) {
    const out = [];
    for (const f of fieldsIn(root)) {
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

  // ==================================================================
  // Section detection: find headers like "Work Experience" / "Education"
  // ==================================================================

  function findSectionByHeader(patterns) {
    const headers = document.querySelectorAll('h1, h2, h3, h4, h5, h6, legend, [role="heading"]');
    for (const h of headers) {
      if (!isVisible(h)) continue;
      const text = cleanText(h.textContent).toLowerCase();
      if (matchesAny(text, patterns)) {
        return sectionContainerFor(h);
      }
    }
    // Also check bold spans / divs commonly used as headers
    const boldish = document.querySelectorAll('strong, b, [class*="section-header"], [class*="sectionHeader"], [class*="SectionTitle"]');
    for (const h of boldish) {
      if (!isVisible(h)) continue;
      const text = cleanText(h.textContent).toLowerCase();
      if (matchesAny(text, patterns)) return sectionContainerFor(h);
    }
    return null;
  }

  function sectionContainerFor(headerEl) {
    // The header's section is usually a parent that contains the Add button
    // and any already-rendered slots. Walk up until we find an ancestor whose
    // text content includes the header text AND contains a button.
    let p = headerEl.parentElement;
    for (let i = 0; i < 6 && p && p.tagName !== 'BODY'; i++) {
      const hasButton = p.querySelector('button, [role="button"], a[role="button"]');
      if (hasButton) return p;
      p = p.parentElement;
    }
    return headerEl.parentElement ?? headerEl;
  }

  // ==================================================================
  // Add-button finder (section-aware)
  // ==================================================================

  const WORK_HEADER_PATTERNS = [
    /\bwork (experience|history)\b/i,
    /\bemployment (history|details|information)\b/i,
    /\bprevious (employer|employment|jobs?)\b/i,
    /\bjob history\b/i,
    /\bexperience\b/i,           // last resort — matches Workday's "My Experience"
    /\bemployment\b/i,
  ];

  const EDU_HEADER_PATTERNS = [
    /\beducation (history|background|details)?\b/i,
    /\bschools? attended\b/i,
    /\beducation\b/i,
    /\bacademic\b/i,
  ];

  const ADD_TEXT_PATTERNS = [
    /^\+?\s*add (another |a |an )?(work )?(experience|employment|job|position|role|history)\b/i,
    /^\+?\s*add (another |a |an )?(school|education|degree)\b/i,
    /^add\+?$/i,                  // plain "Add" — only used when found inside a section
    /^\+\s*add$/i,
    /^\+$/i,
  ];

  function findAddButtonInSection(section, fallbackPatterns = ADD_TEXT_PATTERNS) {
    if (!section) return null;
    const candidates = section.querySelectorAll(
      'button, a[role="button"], [role="button"], input[type="button"]'
    );
    let best = null;
    for (const b of candidates) {
      if (!isVisible(b)) continue;
      const text = cleanText(b.textContent || b.value || '').toLowerCase();
      if (!text) continue;
      // Prefer explicit "add experience" / "add education"
      if (/(experience|employment|job|position|role|history|education|school|degree)/.test(text)
          && /\badd\b|\+/.test(text)) {
        return b;
      }
      if (matchesAny(text, fallbackPatterns)) best = best ?? b;
    }
    return best;
  }

  function findAddExperienceButton() {
    const section = findSectionByHeader(WORK_HEADER_PATTERNS);
    if (section) {
      const b = findAddButtonInSection(section);
      if (b) return b;
    }
    // Fall back to a global search for buttons that mention "experience".
    return findGlobalAddButton(/(work )?(experience|employment|job|position|role)/i);
  }

  function findAddEducationButton() {
    const section = findSectionByHeader(EDU_HEADER_PATTERNS);
    if (section) {
      const b = findAddButtonInSection(section);
      if (b) return b;
    }
    return findGlobalAddButton(/(school|education|degree)/i);
  }

  function findGlobalAddButton(topicRegex) {
    const candidates = document.querySelectorAll('button, a[role="button"], [role="button"]');
    for (const b of candidates) {
      if (!isVisible(b)) continue;
      const text = cleanText(b.textContent || '').toLowerCase();
      if (/\badd\b|\+/.test(text) && topicRegex.test(text)) return b;
    }
    return null;
  }

  // ==================================================================
  // Container detection per section
  // ==================================================================

  function findContainersBySection(section, anchorPatterns) {
    if (!section) return findContainersGlobal(anchorPatterns);
    const containers = [];
    const seen = new Set();
    const anchors = findAllFields(anchorPatterns, section);
    for (const anchor of anchors) {
      const cont = walkToContainer(anchor, section);
      if (cont && !seen.has(cont)) {
        seen.add(cont);
        containers.push(cont);
      }
    }
    return containers;
  }

  function findContainersGlobal(anchorPatterns) {
    const containers = [];
    const seen = new Set();
    for (const anchor of findAllFields(anchorPatterns)) {
      const cont = walkToContainer(anchor);
      if (cont && !seen.has(cont)) {
        seen.add(cont);
        containers.push(cont);
      }
    }
    return containers;
  }

  // Walk up until the container holds at least 2 fields.
  function walkToContainer(field, sectionRoot) {
    let p = field.parentElement;
    for (let i = 0; i < 8 && p && p.tagName !== 'FORM' && p.tagName !== 'BODY'; i++) {
      if (sectionRoot && !sectionRoot.contains(p)) break;
      const count = fieldsIn(p).length;
      if (count >= 2) return p;
      p = p.parentElement;
    }
    return field.parentElement;
  }

  // ==================================================================
  // Date handling — single value + split MM/DD/YYYY pickers
  // ==================================================================

  function parseDate(input) {
    if (!input) return null;
    const s = String(input).trim();
    if (/^present$|^current$|^now$/i.test(s)) return { present: true };

    let m = s.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?/);
    if (m) return makeDate(+m[1], +m[2], m[3] ? +m[3] : 1);

    m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (m) return makeDate(+m[3], +m[1], +m[2]);

    m = s.match(/^(\d{1,2})[-/](\d{4})$/);
    if (m) return makeDate(+m[2], +m[1], 1);

    m = s.match(/^([A-Za-z]+)\s+(\d{4})$/);
    if (m) {
      const idx = monthIndex(m[1]);
      if (idx !== -1) return makeDate(+m[2], idx + 1, 1);
    }

    m = s.match(/^(\d{4})$/);
    if (m) return makeDate(+m[1], 1, 1);

    // "Expected May 2026" / "Expected 2026" / "Expected YYYY-MM"
    m = s.match(/expected\s+(.+)/i);
    if (m) return parseDate(m[1]);

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

  function makeDate(year, month, day = 1) {
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return {
      year: String(year),
      month: mm,
      day: dd,
      monthNum: month,
      monthName: MONTHS[month - 1],
      iso: `${year}-${mm}`,
      isoFull: `${year}-${mm}-${dd}`,
      slash: `${mm}/${year}`,
      slashFull: `${mm}/${dd}/${year}`,
      present: false,
    };
  }

  /**
   * Fill a date region. The region might be:
   *   - A single <input type="date"> -> ISO YYYY-MM-DD
   *   - A single <input type="month"> -> YYYY-MM
   *   - A plain text input -> MM/YYYY
   *   - A wrapper containing 3 inputs for MM, DD, YYYY (the failing case from
   *     the screenshot). We detect that pattern by counting nearby inputs.
   */
  function setDateRegion(rootEl, dateObj) {
    if (!rootEl || !dateObj || dateObj.present) return false;
    const type = (rootEl.type || '').toLowerCase();
    if (type === 'month') return setInputValue(rootEl, dateObj.iso);
    if (type === 'date') return setInputValue(rootEl, dateObj.isoFull);

    // Look for sibling inputs that make up a split picker. We consider the
    // closest "date region": walk up until we find an ancestor containing
    // 2-3 text/number inputs.
    let region = rootEl;
    let p = rootEl.parentElement;
    for (let i = 0; i < 4 && p; i++) {
      const inputs = Array.from(fieldsIn(p)).filter((el) => {
        const t = (el.type || '').toLowerCase();
        return t === 'text' || t === 'tel' || t === 'number' || t === '';
      });
      if (inputs.length >= 2 && inputs.length <= 3) { region = p; break; }
      p = p.parentElement;
    }

    const splitInputs = Array.from(fieldsIn(region)).filter((el) => {
      const t = (el.type || '').toLowerCase();
      return t !== 'date' && t !== 'month' && (t === 'text' || t === 'tel' || t === 'number' || t === '');
    });

    if (splitInputs.length === 2 || splitInputs.length === 3) {
      // Identify each input's role via its placeholder/label/maxlength/name.
      const slots = splitInputs.map((el) => ({ el, role: guessDateInputRole(el) }));
      // If any role couldn't be guessed, assume left-to-right order MM, DD, YYYY (or MM, YYYY).
      const months = slots.filter((s) => s.role === 'month').map((s) => s.el);
      const days = slots.filter((s) => s.role === 'day').map((s) => s.el);
      const years = slots.filter((s) => s.role === 'year').map((s) => s.el);

      let any = false;
      if (months.length === 0 && days.length === 0 && years.length === 0) {
        // Heuristic fallback by order
        if (splitInputs.length === 3) {
          any = setInputValue(splitInputs[0], dateObj.month) || any;
          any = setInputValue(splitInputs[1], dateObj.day) || any;
          any = setInputValue(splitInputs[2], dateObj.year) || any;
        } else {
          any = setInputValue(splitInputs[0], dateObj.month) || any;
          any = setInputValue(splitInputs[1], dateObj.year) || any;
        }
      } else {
        if (months[0]) any = setInputValue(months[0], dateObj.month) || any;
        if (days[0]) any = setInputValue(days[0], dateObj.day) || any;
        if (years[0]) any = setInputValue(years[0], dateObj.year) || any;
      }
      return any;
    }

    // Single plain text input — try MM/YYYY (most common when only a single
    // box is shown for "Start Date").
    return setInputValue(rootEl, dateObj.slash);
  }

  function guessDateInputRole(el) {
    const haystack = describeField(el);
    const max = el.maxLength;
    if (/\bmonth\b|\bmm\b/.test(haystack) || max === 2) {
      if (/\byear\b|\byyyy\b/.test(haystack) || max === 4) return 'year';
      if (/\bday\b|\bdd\b/.test(haystack)) return 'day';
      return 'month';
    }
    if (/\bday\b|\bdd\b/.test(haystack)) return 'day';
    if (/\byear\b|\byyyy\b/.test(haystack) || max === 4) return 'year';
    return 'unknown';
  }

  // ==================================================================
  // Identity fields
  // ==================================================================

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

  // ==================================================================
  // Filling one role
  // ==================================================================

  function fillRole(role, container) {
    const filled = [];
    const skipped = [];

    const titleField = findField(
      [/\b(job title|position title|role title|^title$|^position$|^role$)\b/i, /\btitle\b|\bposition\b/i],
      container,
    );
    if (titleField && setInputValue(titleField, role.title)) filled.push('title');
    else skipped.push('title');

    const companyField = findField(
      [/\b(employer name|company name|company|employer|organi[sz]ation)\b/i],
      container,
    );
    if (companyField && setInputValue(companyField, role.company)) filled.push('company');
    else skipped.push('company');

    const startDate = parseDate(role.startDate);
    const endDate = parseDate(role.endDate);

    if (startDate) {
      const startField = findField([/\bstart(ed|ing)?\b|\bfrom\b/i], container);
      if (startField && setDateRegion(startField, startDate)) filled.push('startDate');
      else skipped.push('startDate');
    }

    if (endDate && !endDate.present) {
      const endField = findField([/\bend(ed|ing)?\b|\bto date\b|\buntil\b/i], container);
      if (endField && setDateRegion(endField, endDate)) filled.push('endDate');
      else skipped.push('endDate');
    } else if (!role.endDate || /present|current|now/i.test(String(role.endDate))) {
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
      [/\b(description|responsibilities|details|duties|what you did|accomplishments|reason for leaving)\b/i],
      container,
    );
    // "Reason for leaving" is its own thing — only fill description into it as
    // last resort. Prefer the "description"-like fields.
    const dedicatedDesc = findField(
      [/\b(description|responsibilities|duties|what you did|accomplishments)\b/i],
      container,
    );
    const target = dedicatedDesc ?? descField;
    if (target && setInputValue(target, role.description || buildDescriptionFromRole(role))) {
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

  // ==================================================================
  // Filling one education entry
  // ==================================================================

  function fillEducation(edu, container) {
    const filled = [];
    const skipped = [];

    const schoolField = findField(
      [/\b(school name|institution name|university|college|school)\b/i],
      container,
    );
    if (schoolField && setInputValue(schoolField, edu.school)) filled.push('school');
    else skipped.push('school');

    if (edu.degree) {
      const degField = findField(
        [/\b(degree|level of education|qualification)\b/i],
        container,
      );
      if (degField && setInputValue(degField, edu.degree)) filled.push('degree');
      else skipped.push('degree');
    }

    if (edu.field) {
      const fieldEl = findField(
        [/\b(field of study|major|subject|concentration|discipline|area of study)\b/i],
        container,
      );
      if (fieldEl && setInputValue(fieldEl, edu.field)) filled.push('field');
      else skipped.push('field');
    }

    const startDate = parseDate(edu.startDate);
    const endDate = parseDate(edu.endDate);

    if (startDate) {
      const startField = findField(
        [/\bstart(ed|ing)?\b|\bfrom\b|\battended from\b/i],
        container,
      );
      if (startField && setDateRegion(startField, startDate)) filled.push('startDate');
    }

    if (endDate) {
      const endField = findField(
        [/\b(end|graduation|graduated|completion|expected)\b|\bto\b|\buntil\b/i],
        container,
      );
      if (endField && setDateRegion(endField, endDate)) filled.push('endDate');
    }

    if (edu.gpa) {
      const gpaField = findField([/\bg\.?p\.?a\.?\b|\bgrade point\b/i], container);
      if (gpaField && setInputValue(gpaField, edu.gpa)) filled.push('gpa');
    }

    return { filled, skipped };
  }

  // ==================================================================
  // Hardcoded yes/no questions
  // ==================================================================

  const HARDCODED_QA = [
    { pattern: /\b(18|17|21|16) ?(years old|years of age)|\bat least \d+\b.*\bage\b|\bof legal age\b/i, answer: 'Yes' },
    { pattern: /\bauthori[sz]ed to work\b|\blegally (allowed|able|eligible) to work\b|\blegal right to work\b|\beligible to work\b/i, answer: 'Yes' },
    { pattern: /\b(provide|provide the )?(necessary )?documentation .*(work|employment)\b|\b(u\.?s\.? )?citizen, ?(permanent resident|foreign national)/i, answer: 'Yes' },
    { pattern: /\b(require|need)\b.*\b(visa|h-?1b|sponsorship)\b|\bvisa sponsorship\b.*\bnow\b|\b(opt|cpt|h-?1b)\b/i, answer: 'No' },
    { pattern: /\bbackground check\b|\bdrug (screen|test)\b|\bcriminal background\b/i, answer: 'Yes' },
    { pattern: /\b(available to work|able to work)\b.*\bhours\b|\b9 ?am.?-?5 ?pm\b|\bregular (business )?hours\b/i, answer: 'Yes' },
    { pattern: /\bwilling to relocate\b|\bopen to relocation\b/i, answer: 'Yes' },
    { pattern: /\bcommute\b.*\bdistance\b|\bwithin commuting distance\b/i, answer: 'Yes' },
  ];

  function answerHardcodedQuestions(results) {
    const QUESTION_CONTAINERS = 'fieldset, [role="radiogroup"], div, section, li';
    const seen = new WeakSet();

    document.querySelectorAll(QUESTION_CONTAINERS).forEach((container) => {
      if (seen.has(container)) return;
      const radios = container.querySelectorAll('input[type="radio"], [role="radio"]');
      if (radios.length < 2 || radios.length > 12) return;
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

  // ==================================================================
  // Public API
  // ==================================================================

  async function autoFill(profile, opts = {}) {
    const results = {
      rolesFilled: 0,
      rolesAttempted: 0,
      eduFilled: 0,
      eduAttempted: 0,
      filled: [],
      skipped: [],
      errors: [],
    };

    if (!profile) {
      results.errors.push('No CV profile available.');
      return results;
    }

    try { fillIdentity(profile, results); }
    catch (err) { results.errors.push(`identity: ${err.message}`); }

    try { answerHardcodedQuestions(results); }
    catch (err) { results.errors.push(`hardcoded: ${err.message}`); }

    // ---- Work experience ----
    const roles = profile.roles ?? [];
    if (roles.length) {
      results.rolesAttempted = roles.length;
      const section = findSectionByHeader(WORK_HEADER_PATTERNS);
      const titleAnchors = [/\b(job title|position title|role title|^title$|^position$|^role$|^title\b)\b/i, /\btitle\b|\bposition\b/i];

      let containers = findContainersBySection(section, titleAnchors);
      const needed = roles.length - containers.length;
      if (needed > 0) {
        const addBtn = findAddExperienceButton();
        if (addBtn) {
          for (let i = 0; i < needed; i++) {
            addBtn.click();
            await sleep(600);
          }
          containers = findContainersBySection(section, titleAnchors);
        } else if (containers.length === 0) {
          results.errors.push("Couldn't find any work-experience fields or an 'Add experience' button.");
        } else {
          results.errors.push(
            `Need ${needed} more experience slot(s) but couldn't find an 'Add experience' button — filling ${containers.length}.`,
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

    // ---- Education ----
    const edu = profile.education ?? [];
    if (edu.length) {
      results.eduAttempted = edu.length;
      const section = findSectionByHeader(EDU_HEADER_PATTERNS);
      const eduAnchors = [/\b(school name|institution|university|college|school)\b/i];

      let containers = findContainersBySection(section, eduAnchors);
      const needed = edu.length - containers.length;
      if (needed > 0) {
        const addBtn = findAddEducationButton();
        if (addBtn) {
          for (let i = 0; i < needed; i++) {
            addBtn.click();
            await sleep(600);
          }
          containers = findContainersBySection(section, eduAnchors);
        } else if (containers.length === 0) {
          // Soft warning — many forms have no education section at all.
          results.skipped.push('education:no-section');
        } else {
          results.errors.push(
            `Need ${needed} more education slot(s) but couldn't find an 'Add education' button — filling ${containers.length}.`,
          );
        }
      }

      for (let i = 0; i < Math.min(edu.length, containers.length); i++) {
        try {
          const { filled, skipped } = fillEducation(edu[i], containers[i]);
          results.eduFilled++;
          results.filled.push(`edu#${i + 1}:${filled.join(',')}`);
          if (skipped.length) results.skipped.push(`edu#${i + 1}:${skipped.join(',')}`);
        } catch (err) {
          results.errors.push(`edu#${i + 1}: ${err.message}`);
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
    if (findAddEducationButton()) return true;
    return false;
  }

  root.__apcompAutofiller = {
    autoFill,
    looksLikeApplicationPage,
    _internals: {
      parseDate,
      findField,
      findSectionByHeader,
      findAddExperienceButton,
      findAddEducationButton,
      labelTextFor,
      setInputValue,
      setSelectValue,
      setDateRegion,
      describeField,
      WORK_HEADER_PATTERNS,
      EDU_HEADER_PATTERNS,
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
