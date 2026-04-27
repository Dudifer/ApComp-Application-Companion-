import type { Job } from '../../../../packages/types/src/job';

interface JobDetailPanelProps {
  job: Job | null;
  onClose: () => void;
  onDismiss: (job: Job) => void;
  onSave: (job: Job) => void;
}

function formatSalary(job: Job): string {
  if (!job.salary) return 'Not specified';
  const { min, max, currency, period, isPredicted } = job.salary;
  const fmt = (n?: number) => n ? `$${n.toLocaleString()}` : null;
  const range = [fmt(min), fmt(max)].filter(Boolean).join(' – ');
  const per = period ? ` / ${period.toLowerCase()}` : '';
  const est = isPredicted ? ' (estimated)' : '';
  return range ? `${range}${per}${est}` : 'Not specified';
}

function formatExperience(job: Job): string {
  if (!job.experience) return 'Not specified';
  if (job.experience.noExperienceRequired) return 'No experience required';
  if (job.experience.requiredMonths) {
    const yrs = Math.floor(job.experience.requiredMonths / 12);
    const mos = job.experience.requiredMonths % 12;
    if (yrs > 0 && mos > 0) return `${yrs}y ${mos}mo+`;
    if (yrs > 0) return `${yrs}+ years`;
    return `${mos}+ months`;
  }
  return 'Mentioned but unspecified';
}

function formatDate(iso?: string): string {
  if (!iso) return 'Unknown';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

function formatContractTime(val: string): string {
  return val.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function Badge({ label, color }: { label: string; color?: string }) {
  return (
    <span style={{
      fontSize: 11, padding: '3px 9px', borderRadius: 99, border: '1px solid var(--border)',
      background: color ?? 'var(--surface-2)', color: 'var(--ink-secondary)',
      fontFamily: 'var(--font-body)', whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: 'var(--ink-tertiary)',
        textTransform: 'uppercase', letterSpacing: '0.06em',
        marginBottom: 10, fontFamily: 'var(--font-body)',
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 13, color: 'var(--ink-tertiary)' }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>{value}</span>
    </div>
  );
}

export function JobDetailPanel({ job, onClose, onDismiss, onSave }: JobDetailPanelProps) {
  if (!job) return null;

  const bestApplyUrl = job.applyOptions?.find(o => o.isDirect)?.url
    ?? job.applyOptions?.[0]?.url
    ?? job.url;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(26,24,20,0.3)',
          zIndex: 200, backdropFilter: 'blur(2px)',
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 520, background: 'var(--surface)',
        zIndex: 201, overflowY: 'auto',
        boxShadow: '-4px 0 40px rgba(26,24,20,0.12)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '24px 28px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'white',
          position: 'sticky', top: 0, zIndex: 1,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, marginRight: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                {job.companyLogo && (
                  <img
                    src={job.companyLogo}
                    alt={job.company}
                    style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'contain', border: '1px solid var(--border)' }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <span style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 99,
                  background: 'var(--surface-2)', color: 'var(--ink-tertiary)',
                  fontFamily: 'var(--font-body)', border: '1px solid var(--border)',
                }}>
                  {job.source === 'adzuna' ? 'Adzuna' : job.publisher ?? 'JSearch'}
                </span>
                {job.remote && (
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 99,
                    background: 'var(--green-light)', color: 'var(--green)',
                    fontFamily: 'var(--font-body)',
                  }}>
                    Remote
                  </span>
                )}
              </div>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 18,
                fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em',
                lineHeight: 1.2, marginBottom: 4,
              }}>
                {job.title}
              </div>
              <div style={{ fontSize: 14, color: 'var(--ink-secondary)' }}>
                {job.company}
                {job.companyType && <span style={{ color: 'var(--ink-tertiary)' }}> · {job.companyType}</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-tertiary)', marginTop: 2 }}>
                {job.location.displayName}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--ink-tertiary)', fontSize: 20, lineHeight: 1, padding: 4,
              }}
            >
              ✕
            </button>
          </div>

          {/* Relevance score */}
          {job.relevanceScore > 0 && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, height: 4, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 99,
                  width: `${job.relevanceScore}%`,
                  background: job.relevanceScore >= 70 ? 'var(--green)' : job.relevanceScore >= 40 ? 'var(--amber)' : 'var(--accent)',
                }} />
              </div>
              <span style={{ fontSize: 12, color: 'var(--ink-secondary)', whiteSpace: 'nowrap' }}>
                {job.relevanceScore}% match
              </span>
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: '24px 28px', flex: 1 }}>

          {/* Tags */}
          {job.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 24 }}>
              {job.tags.map(t => <Badge key={t} label={t} />)}
            </div>
          )}

          {/* Quick meta */}
          <Section title="Details">
            <MetaRow label="Salary" value={formatSalary(job)} />
            <MetaRow label="Contract" value={`${formatContractTime(job.contractTime)} · ${formatContractTime(job.contractType)}`} />
            <MetaRow label="Experience" value={formatExperience(job)} />
            {job.education?.bachelorsRequired && (
              <MetaRow label="Education" value={
                job.education.postgraduateRequired ? "Postgraduate degree" :
                job.education.degreePreferred ? "Bachelor's (preferred)" : "Bachelor's degree"
              } />
            )}
            <MetaRow label="Posted" value={formatDate(job.postedAt)} />
            {job.expiresAt && <MetaRow label="Expires" value={formatDate(job.expiresAt)} />}
            {job.category && <MetaRow label="Category" value={job.category} />}
            {job.companyWebsite && (
              <MetaRow label="Company" value={job.companyWebsite.replace(/^https?:\/\//, '')} />
            )}
          </Section>

          {/* Highlights */}
          {job.highlights?.responsibilities && job.highlights.responsibilities.length > 0 && (
            <Section title="Responsibilities">
              <ul style={{ paddingLeft: 16, margin: 0 }}>
                {job.highlights.responsibilities.map((r, i) => (
                  <li key={i} style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.6, marginBottom: 4 }}>{r}</li>
                ))}
              </ul>
            </Section>
          )}

          {job.highlights?.qualifications && job.highlights.qualifications.length > 0 && (
            <Section title="Qualifications">
              <ul style={{ paddingLeft: 16, margin: 0 }}>
                {job.highlights.qualifications.map((q, i) => (
                  <li key={i} style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.6, marginBottom: 4 }}>{q}</li>
                ))}
              </ul>
            </Section>
          )}

          {job.highlights?.benefits && job.highlights.benefits.length > 0 && (
            <Section title="Benefits">
              <ul style={{ paddingLeft: 16, margin: 0 }}>
                {job.highlights.benefits.map((b, i) => (
                  <li key={i} style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.6, marginBottom: 4 }}>{b}</li>
                ))}
              </ul>
            </Section>
          )}

          {/* Description */}
          <Section title="Full description">
            <p style={{
              fontSize: 13, color: 'var(--ink-secondary)', lineHeight: 1.7,
              whiteSpace: 'pre-wrap', margin: 0,
            }}>
              {job.description}
            </p>
          </Section>

          {/* Apply options */}
          {(job.applyOptions ?? []).length > 1 && (
            <Section title="Apply via">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {job.applyOptions!.map(o => (
                  <a
                    key={o.url}
                    href={o.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)',
                      background: 'white', textDecoration: 'none', fontSize: 13,
                      color: 'var(--ink)', transition: 'background 0.15s',
                    }}
                  >
                    <span>{o.publisher}</span>
                    {o.isDirect && (
                      <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 500 }}>Direct</span>
                    )}
                  </a>
                ))}
              </div>
            </Section>
          )}
        </div>

        {/* Footer actions */}
        <div style={{
          padding: '16px 28px',
          borderTop: '1px solid var(--border)',
          background: 'white',
          position: 'sticky', bottom: 0,
          display: 'flex', gap: 10,
        }}>
          <a
            href={bestApplyUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1, padding: '11px 0', background: 'var(--ink)', color: 'white',
              borderRadius: 8, fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
              textDecoration: 'none', textAlign: 'center', transition: 'opacity 0.15s',
            }}
          >
            Apply now →
          </a>
          <button
            onClick={() => onSave(job)}
            style={{
              padding: '11px 18px', background: 'white', border: '1px solid var(--border)',
              borderRadius: 8, fontSize: 13, color: 'var(--ink-secondary)',
              cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'background 0.15s',
            }}
          >
            Save ♡
          </button>
          <button
            onClick={() => { onDismiss(job); onClose(); }}
            style={{
              padding: '11px 18px', background: 'white', border: '1px solid var(--border)',
              borderRadius: 8, fontSize: 13, color: 'var(--ink-tertiary)',
              cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'background 0.15s',
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </>
  );
}
