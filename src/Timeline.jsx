export const TYPE_LABELS = {
  consultation: "Consultation",
  lab_report: "Lab report",
  prescription: "Prescription",
  imaging: "Imaging",
  unknown: "Unknown type",
};

export const TYPE_ICONS = {
  consultation: "🩺",
  lab_report: "🧪",
  prescription: "💊",
  imaging: "🩻",
  unknown: "📄",
};

export function formatDate(d) {
  if (!d) return "Date unknown";
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(s) {
  if (!s) return "";
  const d = new Date(s.replace(" ", "T"));
  if (isNaN(d)) return s;
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function VerifiedBadge({ record }) {
  return record.verified ? (
    <span className="badge ok">✔ Verified</span>
  ) : (
    <span className="badge warn">Unverified</span>
  );
}

function StatusBadge({ status }) {
  if (status === "complete") return null;
  if (status === "partial") return <span className="badge warn">Incomplete</span>;
  return <span className="badge bad">Extraction failed</span>;
}

export function VerificationNote({ record }) {
  if (record.verified) {
    return (
      <div className="verified-note">
        ✔ Checked against the original document by {record.verified_by} on {formatDateTime(record.verified_at)}
      </div>
    );
  }
  return (
    <div className="unverified">
      Auto-extracted and not yet verified. Compare it with the original document before relying on it.
    </div>
  );
}

// The extracted details of one record (used in the timeline and the detail panel)
export function RecordInfo({ record, showNote = true }) {
  const d = record.extracted_data;
  return (
    <>
      {d.doctor_name && <div className="muted">Doctor: {d.doctor_name}</div>}

      {d.diagnoses.length > 0 && (
        <>
          <div className="label">Diagnoses mentioned</div>
          <ul>
            {d.diagnoses.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </>
      )}

      {d.medications.length > 0 && (
        <>
          <div className="label">Medications</div>
          <ul>
            {d.medications.map((m, i) => (
              <li key={i}>
                {m.name} {m.dosage ? `(${m.dosage})` : <span className="muted">(dosage not stated)</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {d.lab_results.length > 0 && (
        <>
          <div className="label">Lab results</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Test</th>
                  <th>Result</th>
                  <th>Reference range</th>
                </tr>
              </thead>
              <tbody>
                {d.lab_results.map((t, i) => (
                  <tr key={i}>
                    <td>{t.test}</td>
                    <td>
                      {t.value} {t.unit || ""}
                    </td>
                    <td>{t.reference_range || "not stated"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {d.warnings.length > 0 && (
        <div className="warnings">
          <strong>Information that could not be found</strong>
          <ul>
            {d.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {showNote && <VerificationNote record={record} />}
    </>
  );
}

export default function Timeline({ records, onSelect, emptyText }) {
  if (records.length === 0) {
    return (
      <div className="card empty">
        <span className="big">🗂️</span>
        {emptyText || "No records yet."}
      </div>
    );
  }

  return (
    <div className="timeline">
      {records.map((r) => (
        <div className="record" key={r.id}>
          <div className="record-head">
            <div>
              <span className="record-date">{formatDate(r.document_date)}</span>{" "}
              <span className="badge">
                {TYPE_ICONS[r.document_type] || "📄"} {TYPE_LABELS[r.document_type] || r.document_type}
              </span>
            </div>
            <div>
              <StatusBadge status={r.extraction_status} />
              <VerifiedBadge record={r} />
            </div>
          </div>
          <div>{r.source_name || <span className="muted">Source not found</span>}</div>
          <RecordInfo record={r} />
          <div className="record-actions">
            <button className="btn small" onClick={() => onSelect(r)}>
              View original and verify
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}