/**
 * Rec Lab 2 — clean rebuild of the Rec Lab sandbox. Starting point: three
 * empty boxes (recommended / dismissed / saved jobs), filled in
 * incrementally from here.
 */
export default function RecLab2Page() {
  return (
    <div className="section">
      <div className="section-header">
        <div className="section-title">Rec Lab 2</div>
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        <div
          style={{
            flex: 1,
            minHeight: 320,
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: 20,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--ink)',
            }}
          >
            Recommended Jobs
          </div>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 320,
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: 20,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--ink)',
            }}
          >
            Dismissed Jobs
          </div>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 320,
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: 20,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--ink)',
            }}
          >
            Saved Jobs
          </div>
        </div>
      </div>
    </div>
  );
}
