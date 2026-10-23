import { useCallback, useEffect, useState } from "react";
import { api, apiJson } from "./api";
import Timeline from "./Timeline";
import RecordDetail from "./RecordDetail";
import AccessPanel from "./AccessPanel";

const TYPE_OPTIONS = [
  ["", "All types"],
  ["lab_report", "Blood tests / lab"],
  ["imaging", "Imaging"],
  ["prescription", "Prescriptions"],
  ["consultation", "Consultations"],
  ["unknown", "Other"],
];

const EMPTY_FILTERS = { type: "", date_from: "", date_to: "", q: "" };

export default function RecordsDashboard({ session, onUnauthorized }) {
  const { token, user_id, name } = session;
  const [records, setRecords] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState([]);
  const [dragging, setDragging] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (filters.type) params.set("type", filters.type);
    if (filters.date_from) params.set("date_from", filters.date_from);
    if (filters.date_to) params.set("date_to", filters.date_to);
    if (filters.q.trim()) params.set("q", filters.q.trim());

    try {
      const data = await apiJson(`/patients/${user_id}/records?${params}`, { token });
      setRecords(data);
      setError("");
    } catch (e) {
      if (e.status === 401) onUnauthorized();
      else setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filters, token, user_id, onUnauthorized]);

  useEffect(() => {
    load();
  }, [load]);

  function setFilter(key, value) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  async function uploadFiles(files) {
    if (files.length === 0 || uploading) return;
    setUploading(true);
    setUploadResults([]);
    const results = [];

    for (const file of files) {
      const form = new FormData();
      form.append("file", file);
      try {
        await api("/documents/upload", { method: "POST", body: form, token, isForm: true });
        results.push({ ok: true, text: `✔ ${file.name}: uploaded and read` });
      } catch (err) {
        if (err.status === 401) {
          onUnauthorized();
          return;
        }
        results.push({ ok: false, text: `${file.name}: ${err.message}` });
      }
    }

    setUploadResults(results);
    setUploading(false);
    await load();
  }

  function handleChosen(e) {
    const files = Array.from(e.target.files);
    e.target.value = "";
    uploadFiles(files);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    uploadFiles(Array.from(e.dataTransfer.files));
  }

  function openRecord(record) {
    setSelected(record);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleChanged(updated) {
    setSelected(updated);
    setRecords((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
  }

  return (
    <>
      <div className="banner">
        <h1>Welcome back, {name} 👋</h1>
        <p>Upload your medical reports, see them on one timeline, and choose which doctors can view them.</p>
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

      <div className="split">
        <div className="card">
          <h2>📤 Upload documents</h2>
          <div
            className={"dropzone" + (dragging ? " dragging" : "")}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <div className="dropzone-icon">📄</div>
            <strong>Drag and drop PDF reports here</strong>
            <span className="muted">or</span>
            <label className="btn">
              Choose files
              <input type="file" accept="application/pdf" multiple hidden onChange={handleChosen} disabled={uploading} />
            </label>
            <span className="muted small">PDFs with selectable text, up to 10 MB each. Duplicates are skipped.</span>
          </div>
          {uploading && <p className="muted">⏳ Uploading and reading your documents...</p>}
          {uploadResults.map((r, i) => (
            <div key={i} className={r.ok ? "success" : "error"}>
              {r.text}
            </div>
          ))}
        </div>

        <div className="card">
          <h2>🔐 Who can see my records</h2>
          <AccessPanel token={token} onUnauthorized={onUnauthorized} />
        </div>
      </div>

      <div className="card">
        <h2>🗓️ Medical timeline</h2>
        <div className="filters">
          <label>
            Type
            <select value={filters.type} onChange={(e) => setFilter("type", e.target.value)}>
              {TYPE_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            From
            <input type="date" value={filters.date_from} onChange={(e) => setFilter("date_from", e.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={filters.date_to} onChange={(e) => setFilter("date_to", e.target.value)} />
          </label>
          <label>
            Search
            <input
              type="text"
              placeholder="e.g. HbA1c, metformin"
              value={filters.q}
              onChange={(e) => setFilter("q", e.target.value)}
            />
          </label>
          <button className="btn secondary small" onClick={() => setFilters(EMPTY_FILTERS)}>
            Clear
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <Timeline
          records={records}
          onSelect={openRecord}
          emptyText="No records match. Upload a document above, or clear the filters."
        />
      )}
    </>
  );
}