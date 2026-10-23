import { useCallback, useState } from "react";
import { apiJson } from "./api";
import RecordsDashboard from "./RecordsDashboard";
import ResultsDashboard from "./ResultsDashboard";

const DEMO_USERS = [
  { label: "Demo Patient", sub: "Patient", icon: "🙂", role: "patient", user_id: 1 },
  { label: "Dr. Asha Rao", sub: "Doctor", icon: "🩺", role: "doctor", user_id: 1 },
  { label: "Dr. Vikram Nair", sub: "Doctor", icon: "🩺", role: "doctor", user_id: 2 },
];

const PATIENT_NAV = [
  { id: "records", icon: "📁", label: "My Records" },
  { id: "results", icon: "✅", label: "Results & Verification" },
];

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem("session"));
  } catch {
    return null;
  }
}

function Login({ onLogin }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function login(user) {
    setError("");
    setBusy(true);
    try {
      const session = await apiJson("/auth/login", {
        method: "POST",
        body: { role: user.role, user_id: user.user_id },
      });
      onLogin(session);
    } catch (e) {
      setError(
        e.message === "Failed to fetch"
          ? "Cannot reach the backend. Is it running on http://localhost:8000?"
          : e.message
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="banner">
          <h1>🩺 Unified Patient Health Records</h1>
          <p>All your medical documents, one clear timeline.</p>
        </div>
        <div className="card">
          <h2>Choose a demo account</h2>
          <p className="muted small">Prototype with synthetic data only. No real patient information.</p>
          {DEMO_USERS.map((u) => (
            <button key={u.role + u.user_id} className="btn full" disabled={busy} onClick={() => login(u)}>
              {u.icon} {u.label} <span style={{ opacity: 0.85 }}>({u.sub})</span>
            </button>
          ))}
          {error && <div className="error">{error}</div>}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(loadSession);
  const [page, setPage] = useState("records");

  const logout = useCallback(() => {
    localStorage.removeItem("session");
    setSession(null);
    setPage("records");
  }, []);

  function handleLogin(s) {
    localStorage.setItem("session", JSON.stringify(s));
    setSession(s);
  }

  if (!session) return <Login onLogin={handleLogin} />;

  const isPatient = session.role === "patient";

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          🩺 Unified
          <br />
          Health Records
        </div>

        {isPatient ? (
          PATIENT_NAV.map((n) => (
            <button
              key={n.id}
              className={"nav-btn" + (page === n.id ? " active" : "")}
              onClick={() => setPage(n.id)}
            >
              <span>{n.icon}</span> {n.label}
            </button>
          ))
        ) : (
          <button className="nav-btn active">
            <span>👥</span> My Patients
          </button>
        )}

        <div className="sidebar-user">
          <strong>{session.name}</strong>
          <div className="small">{isPatient ? "Patient" : "Doctor"} · demo account</div>
          <button className="btn secondary small" style={{ marginTop: 8 }} onClick={logout}>
            Log out
          </button>
        </div>
      </aside>

      <main className="main">
        {isPatient ? (
          page === "records" ? (
            <RecordsDashboard session={session} onUnauthorized={logout} />
          ) : (
            <ResultsDashboard token={session.token} patientId={session.user_id} onUnauthorized={logout} />
          )
        ) : (
          <div className="banner">
            <h1>Doctor dashboard</h1>
            <p>Coming in the next step.</p>
          </div>
        )}
      </main>
    </div>
  );
}