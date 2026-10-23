import { useCallback, useEffect, useState } from "react";
import { apiJson } from "./api";
import Timeline from "./Timeline";
import RecordDetail from "./RecordDetail";
import ResultsDashboard from "./ResultsDashboard";

const TYPE_OPTIONS = [
  ["", "All types"],
  ["lab_report", "Blood tests / lab"],
  ["imaging", "Imaging"],
  ["prescription", "Prescriptions"],
  ["consultation", "Consultations"],
  ["unknown", "Other"],
];

const EMPTY_FILTERS = { type: "", date_from: "", date_to: "", q: "" };

function PatientTimeline({ token, patientId, onUnauthorized, onDenied }) {
  const [records, setRecords] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (filters.type) params.set("type", filters.type);
    if (filters.date_from) params.set("date_from", filters.date_from);
    if (filters.date_to) params.set("date_to", filters.date_to);
    if (filters.q.trim()) params.set("q", filters.q.trim());

    try {
      const data = await apiJson(`/patients/${patientId}/records?${params}`, { token });
      setRecords(data);
      setDenied(false);
      setError("");
    } catch (e) {
      if (e.status === 401) onUnauthorized();
      else if (e.status === 403) {
        setDenied(true);
        setRecords([]);
        setSelected(null);
      } else setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filters, token, patientId, onUnauthorized]);

  useEffect(() => {
    load();
  }, [load]);

  function setFilter(key, value) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  function openRecord(record) {
    setSelected(record);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleChanged(updated) {
    setSelected(updated);
    setRecords((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
  }

  if (denied) {
    return (
      <div className="card empty">
        <span className="big">🔒</span>
        <strong>Access denied</strong>
        <p>
          This patient has not given you access, or they have removed it. The server refused the request, so no
          records are shown.
        </p>
        <button className="btn" onClick={onDenied}>
          Refresh my patient list
        </button>
      </div>
    );
  }

  return (
    <>
      {selected && (
        <RecordDetail
          record={selected}
          token={token}
          onClose={() => setSelected(null)}
          onChanged={handleChanged}
          onUnauthorized={onUnauthorized}
        />
      )}

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
          emptyText="No records match. Try clearing the filters."
        />
      )}
    </>
  );
}

export default function DoctorDashboard({ session, onUnauthorized }) {
  const { token, name } = session;
  const [patients, setPatients] = useState([]);
  const [patientId, setPatientId] = useState(null);
  const [view, setView] = useState("timeline");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPatients = useCallback(async () => {
    try {
      const list = await apiJson("/doctors/patients", { token });
      setPatients(list);
      setPatientId((cur) => (list.some((p) => p.id === cur) ? cur : list.length ? list[0].id : null));
      setError("");
    } catch (e) {
      if (e.status === 401) onUnauthorized();
      else setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, onUnauthorized]);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  return (
    <>
      <div className="banner">
        <h1>Hello, {name} 👋</h1>
        <p>Records that patients have chosen to share with you. You can read and verify, but not upload.</p>
      </div>

      {error && <div className="error">{error}</div>}

      {loading ? (
        <p className="muted">Loading...</p>
      ) : patients.length === 0 ? (
        <div className="card empty">
          <span className="big">📭</span>
          <strong>No patient has shared records with you yet</strong>
          <p>
            Ask the patient to open <em>My Records</em> and click <em>Grant access</em> next to your name, then
            refresh.
          </p>
          <button className="btn" onClick={loadPatients}>
            Refresh list
          </button>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="record-head">
              <h2>👥 My patients</h2>
              <button className="btn secondary small" onClick={loadPatients}>
                Refresh list
              </button>
            </div>
            <div className="tabs">
              {patients.map((p) => (
                <button
                  key={p.id}
                  className={"tab" + (patientId === p.id ? " active" : "")}
                  onClick={() => setPatientId(p.id)}
                >
                  🙂 {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="tabs">
            <button className={"tab" + (view === "timeline" ? " active" : "")} onClick={() => setView("timeline")}>
              🗓️ Timeline
            </button>
            <button className={"tab" + (view === "results" ? " active" : "")} onClick={() => setView("results")}>
              ✅ Results & Verification
            </button>
          </div>

          {view === "timeline" ? (
            <PatientTimeline
              key={"t" + patientId}
              token={token}
              patientId={patientId}
              onUnauthorized={onUnauthorized}
              onDenied={loadPatients}
            />
          ) : (
            <ResultsDashboard
              key={"r" + patientId}
              token={token}
              patientId={patientId}
              onUnauthorized={onUnauthorized}
            />
          )}
        </>
      )}
    </>
  );
}