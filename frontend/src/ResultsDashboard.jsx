import { useCallback, useEffect, useState } from "react";
import { apiJson } from "./api";
import RecordDetail from "./RecordDetail";
import { TYPE_ICONS, TYPE_LABELS, VerifiedBadge, formatDate } from "./Timeline";

const TABS = [
  ["labs", "🧪 Lab results"],
  ["meds", "💊 Medications"],
  ["dx", "🩺 Diagnoses mentioned"],
];

export default function ResultsDashboard({ token, patientId, onUnauthorized }) {
  const [records, setRecords] = useState([]);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("labs");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setRecords(await apiJson(`/patients/${patientId}/records`, { token }));
      setError("");
    } catch (e) {
      if (e.status === 401) onUnauthorized();
      else setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, patientId, onUnauthorized]);

  useEffect(() => {
    load();
  }, [load]);

  function openRecord(record) {
    setSelected(record);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleChanged(updated) {
    setSelected(updated);
    setRecords((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
  }

  const total = records.length;
  const verified = records.filter((r) => r.verified).length;
  const needReview = records.filter((r) => !r.verified && r.extraction_status !== "failed");
  const incomplete = records.filter((r) => r.extraction_status !== "complete").length;

  const labRows = records
    .flatMap((r) => r.extracted_data.lab_results.map((t) => ({ ...t, record: r })))
    .sort(
      (a, b) =>
        a.test.localeCompare(b.test) ||
        (a.record.document_date || "").localeCompare(b.record.document_date || "")
    );
  const medRows = records.flatMap((r) => r.extracted_data.medications.map((m) => ({ ...m, record: r })));
  const dxRows = records.flatMap((r) => r.extracted_data.diagnoses.map((d) => ({ name: d, record: r })));

  function SourceCell({ record }) {
    return (
      <button className="link" onClick={() => openRecord(record)}>
        {TYPE_ICONS[record.document_type]} {record.source_name || TYPE_LABELS[record.document_type] || "Document"}
      </button>
    );
  }

  function EmptyRows({ text }) {
    return (
      <div className="empty">
        <span className="big">🔍</span>
        {text}
      </div>
    );
  }

  return (
    <>
      <div className="banner">
        <h1>Results & Verification ✅</h1>
        <p>Everything found in the documents, in one place. Check it against the originals to mark it as verified.</p>
      </div>

      {selected && (
        <RecordDetail
          record={selected}
          token={token}
          onClose={() => setSelected(null)}
          onChanged={handleChanged}
          onUnauthorized={onUnauthorized}
        />
      )}

      {error && <div className="error">{error}</div>}
      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <>
          <div className="stats">
            <div className="stat">
              <div className="stat-num">{total}</div>
              <div className="stat-label">Documents</div>
            </div>
            <div className="stat">
              <div className="stat-num">{verified}</div>
              <div className="stat-label">Verified</div>
            </div>
            <div className="stat">
              <div className="stat-num">{needReview.length}</div>
              <div className="stat-label">Need review</div>
            </div>
            <div className="stat">
              <div className="stat-num">{incomplete}</div>
              <div className="stat-label">Incomplete</div>
            </div>
          </div>

          <div className="help">
            <strong>How verification works.</strong> Results are read automatically from your PDFs, so they can be
            wrong. Open a document, compare the extracted values with the original, and only then mark it as
            verified. Verified means it matches the document, not that the document itself has been medically
            reviewed.
          </div>

          <div className="card">
            <h2>📝 Needs review ({needReview.length})</h2>
            {needReview.length === 0 ? (
              <div className="empty">
                <span className="big">🎉</span>
                {total === 0 ? "No documents yet. Upload some on the My Records page." : "Everything has been verified."}
              </div>
            ) : (
              needReview.map((r) => (
                <div className="row" key={r.id}>
                  <div>
                    <strong>
                      {TYPE_ICONS[r.document_type]} {TYPE_LABELS[r.document_type] || r.document_type}
                    </strong>{" "}
                    · {formatDate(r.document_date)}
                    <div className="muted small">
                      {r.source_name || "Source not found"}
                      {r.extraction_status === "partial" && <span className="badge warn"> Incomplete</span>}
                    </div>
                  </div>
                  <button className="btn small" onClick={() => openRecord(r)}>
                    Review and verify
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="card">
            <h2>🔎 Observations from your documents</h2>
            <div className="tabs">
              {TABS.map(([id, label]) => (
                <button key={id} className={"tab" + (tab === id ? " active" : "")} onClick={() => setTab(id)}>
                  {label}
                </button>
              ))}
            </div>

            {tab === "labs" &&
              (labRows.length === 0 ? (
                <EmptyRows text="No lab results found in the documents yet." />
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Test</th>
                        <th>Result</th>
                        <th>Reference range</th>
                        <th>Date</th>
                        <th>Document</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {labRows.map((t, i) => (
                        <tr key={i}>
                          <td>{t.test}</td>
                          <td>
                            {t.value} {t.unit || ""}
                          </td>
                          <td>{t.reference_range || "not stated"}</td>
                          <td>{formatDate(t.record.document_date)}</td>
                          <td>
                            <SourceCell record={t.record} />
                          </td>
                          <td>
                            <VerifiedBadge record={t.record} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

            {tab === "meds" &&
              (medRows.length === 0 ? (
                <EmptyRows text="No medications found in the documents yet." />
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Medication</th>
                        <th>Dosage</th>
                        <th>Date</th>
                        <th>Document</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {medRows.map((m, i) => (
                        <tr key={i}>
                          <td>{m.name}</td>
                          <td>{m.dosage || <span className="muted">not stated</span>}</td>
                          <td>{formatDate(m.record.document_date)}</td>
                          <td>
                            <SourceCell record={m.record} />
                          </td>
                          <td>
                            <VerifiedBadge record={m.record} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

            {tab === "dx" &&
              (dxRows.length === 0 ? (
                <EmptyRows text="No diagnoses found in the documents yet." />
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Diagnosis (as written)</th>
                        <th>Date</th>
                        <th>Document</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dxRows.map((d, i) => (
                        <tr key={i}>
                          <td>{d.name}</td>
                          <td>{formatDate(d.record.document_date)}</td>
                          <td>
                            <SourceCell record={d.record} />
                          </td>
                          <td>
                            <VerifiedBadge record={d.record} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
          </div>
        </>
      )}
    </>
  );
}