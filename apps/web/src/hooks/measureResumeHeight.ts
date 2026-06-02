import type { ResumeState } from './useResumeBuilder';

// ── PDF → browser pixel conversion ───────────────────────────────────────────
// PDF uses points (1pt = 1/72 inch). Browser at 96dpi: 1pt = 96/72 = 1.333px
// Letter page: 612pt × 792pt
// Margins: 48pt horizontal, 36pt vertical
// Content area: (612-96)pt × (792-72)pt = 516pt × 720pt

const PT = 96 / 72; // pt to px multiplier
const CONTENT_WIDTH_PX  = Math.round(516 * PT); // ~688px
const CONTENT_HEIGHT_PX = Math.round(720 * PT); // ~960px

// Match the PDF template's font sizes (in pt, converted to px)
const FONT = {
  name:       `${22 * PT}px`,  // header name
  sectionHdr: `${11 * PT}px`,  // section headers
  expTitle:   `${10 * PT}px`,  // job title / project name
  body:       `${9.5 * PT}px`, // body text
  small:      `${9 * PT}px`,   // bullets, dates
};

const LINE_HEIGHT = 1.45;

// ── HTML builder ──────────────────────────────────────────────────────────────

function formatDate(d?: string): string {
  if (!d) return '';
  if (!d.includes('-')) return d;
  const [y, m] = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m) - 1] ?? ''} ${y}`;
}

function sectionHeader(title: string): string {
  return `
    <div style="
      font-size: ${FONT.sectionHdr};
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      border-bottom: 1px solid #000;
      padding-bottom: ${2 * PT}px;
      margin-top: ${10 * PT}px;
      margin-bottom: ${6 * PT}px;
    ">${title}</div>
  `;
}

function bullet(text: string): string {
  return `
    <div style="
      display: flex;
      gap: ${8 * PT}px;
      margin-bottom: ${2 * PT}px;
      padding-left: ${8 * PT}px;
      font-size: ${FONT.small};
      line-height: ${LINE_HEIGHT};
    ">
      <span style="flex-shrink:0">•</span>
      <span>${text}</span>
    </div>
  `;
}

function buildHTML(state: ResumeState): string {
  const { header, aboutMe, education, experience, projects, skillGroups } = state;

  const activeExp      = experience.filter(e => e.active);
  const activeProjects = projects.filter(p => p.active);
  const activeSkills   = skillGroups.filter(sg => sg.active);
  const activeEdu      = education.filter(e => e.active);

  const contactParts = [header.phone, header.email, header.linkedin, header.github]
    .filter(Boolean).join(' | ');

  let html = `
    <div style="font-size:${FONT.name}; font-weight:700; text-align:center; margin-bottom:${4*PT}px;">
      ${header.name}
    </div>
    <div style="font-size:${FONT.expTitle}; text-align:center; margin-bottom:${8*PT}px;">
      ${header.title}
    </div>
    <div style="font-size:${FONT.small}; text-align:center; margin-bottom:${12*PT}px;">
      ${contactParts}
    </div>
  `;

  // Education
  if (activeEdu.length > 0) {
    html += sectionHeader('Education');
    activeEdu.forEach(edu => {
      html += `
        <div style="display:flex; justify-content:space-between; font-size:${FONT.expTitle}; font-weight:600; margin-bottom:${1*PT}px;">
          <span>${edu.institution}</span><span>${edu.location}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:${FONT.body}; margin-bottom:${4*PT}px;">
          <span>${edu.degree}</span><span>${edu.dates}</span>
        </div>
      `;
    });
  }

  // About Me
  if (aboutMe) {
    html += sectionHeader('About Me');
    html += `<div style="font-size:${FONT.small}; line-height:${LINE_HEIGHT};">${aboutMe}</div>`;
  }

  // Work Experience
  if (activeExp.length > 0) {
    html += sectionHeader('Work Experience');
    activeExp.forEach(exp => {
      const activeBullets = (exp.bullets ?? []).filter(b => b.active);
      html += `
        <div style="margin-bottom:${8*PT}px;">
          <div style="display:flex; justify-content:space-between; font-size:${FONT.expTitle}; font-weight:600; margin-bottom:${1*PT}px;">
            <span>${exp.title}</span>
            <span style="font-weight:400; font-size:${FONT.small};">
              ${formatDate(exp.startDate)} – ${exp.endDate ? formatDate(exp.endDate) : 'Present'}
            </span>
          </div>
          <div style="font-size:${FONT.body}; font-style:italic; margin-bottom:${3*PT}px;">
            ${exp.company}
          </div>
          ${activeBullets.map(b => bullet(b.text)).join('')}
        </div>
      `;
    });
  }

  // Personal Projects
  if (activeProjects.length > 0) {
    html += sectionHeader('Personal Projects');
    activeProjects.forEach(proj => {
      const activeBullets = (proj.bullets ?? []).filter(b => b.active);
      html += `
        <div style="margin-bottom:${8*PT}px;">
          <div style="display:flex; justify-content:space-between; font-size:${FONT.expTitle}; margin-bottom:${1*PT}px;">
            <span>
              <strong>${proj.name}</strong>
              ${proj.category ? ` | ${proj.category}` : ''}
            </span>
            <span style="font-size:${FONT.small};">${proj.date ?? ''}</span>
          </div>
          ${proj.techStack ? `<div style="font-size:${FONT.small}; font-style:italic; margin-bottom:${3*PT}px;">${proj.techStack}</div>` : ''}
          ${activeBullets.map(b => bullet(b.text)).join('')}
        </div>
      `;
    });
  }

  // Technical Skills
  if (activeSkills.length > 0) {
    html += sectionHeader('Technical Skills');
    activeSkills.forEach(sg => {
      html += `
        <div style="display:flex; gap:${8*PT}px; margin-bottom:${3*PT}px; font-size:${FONT.small};">
          <span style="font-weight:600; min-width:${140*PT}px;">${sg.label}:</span>
          <span>${sg.skills}</span>
        </div>
      `;
    });
  }

  return html;
}

// ── Measure in hidden DOM node ────────────────────────────────────────────────

export interface MeasureResult {
  heightPx: number;
  estimatedPages: number;
  fitsOnePage: boolean;
  overflowPx: number;
}

export function measureResumeHeight(state: ResumeState): MeasureResult {
  // Create hidden container matching PDF content width
  const container = document.createElement('div');
  container.style.cssText = `
    position: absolute;
    top: -99999px;
    left: -99999px;
    width: ${CONTENT_WIDTH_PX}px;
    visibility: hidden;
    pointer-events: none;
    font-family: Helvetica, Arial, sans-serif;
    font-size: ${FONT.body};
    line-height: ${LINE_HEIGHT};
    color: #000;
    box-sizing: border-box;
    word-wrap: break-word;
    overflow-wrap: break-word;
  `;

  container.innerHTML = buildHTML(state);
  document.body.appendChild(container);

  const heightPx = container.scrollHeight;
  document.body.removeChild(container);

  const estimatedPages = heightPx / CONTENT_HEIGHT_PX;
  const fitsOnePage = estimatedPages <= 1.05; // 5% tolerance for rounding
  const overflowPx = Math.max(0, heightPx - CONTENT_HEIGHT_PX);

  return { heightPx, estimatedPages, fitsOnePage, overflowPx };
}

export { CONTENT_HEIGHT_PX, CONTENT_WIDTH_PX };
