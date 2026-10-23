import { useCallback, useEffect, useState } from "react";
import { apiJson } from "./api";

const STATUS = {
  granted: { cls: "ok", text: "Can view your records" },
  revoked: { cls: "bad", text: "Access removed" },
  none: { cls: "neutral", text: "No access" },
};

export default function AccessPanel({ token, onUnauthorized }) {
  const [doctors, setDoctors] = useState([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      setDoctors(await apiJson("/access", { token }));
      setError("");
    } catch (e) {
      if (e.status === 401) onUnauthorized();
      else setError(e.message);
    }
  }, [token, onUnauthorized]);

  useEffect(() => {
    load();
  }, [load]);

  async function change(doctorId, action) {
    setBusyId(doctorId);
    try {
      await apiJson(`/access/${action}`, { method: "POST", body: { doctor_id: doctorId }, token });
      await load();
    } catch (e) {
      if (e.status === 401) onUnauthorized();
      else setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <p className="muted small">You decide which doctors can see your records. You can remove access at any time.</p>
      {doctors.map((d) => {
        const s = STATUS[d.status] || STATUS.none;
        return (
          <div className="row" key={d.doctor_id}>
            <div>
              <strong>{d.doctor_name}</strong>
              <div>
                <span className={`badge ${s.cls}`}>{s.text}</span>
              </div>
            </div>
            {d.status === "granted" ? (
              <button className="btn danger small" disabled={busyId === d.doctor_id} onClick={() => change(d.doctor_id, "revoke")}>
                Revoke access
              </button>
            ) : (
              <button className="btn small" disabled={busyId === d.doctor_id} onClick={() => change(d.doctor_id, "grant")}>
                Grant access
              </button>
            )}
          </div>
        );
      })}
      {error && <div className="error">{error}</div>}
    </div>
  );
}