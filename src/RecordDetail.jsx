import { useEffect, useState } from "react";
import { apiJson, fetchPdfBlobUrl } from "./api";
import { RecordInfo, TYPE_ICONS, TYPE_LABELS, VerificationNote, formatDate } from "./Timeline";

export default function RecordDetail({ record, token, onClose, onChanged, onUnauthorized }) {
  const [url, setUrl] = useState(null);
  const [pdfError, setPdfError] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;
    setUrl(null);
    setPdfError("");

    fetchPdfBlobUrl(record.id, token)
      .then((u) => {
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        objectUrl = u;
        setUrl(u);
      })
      .catch((e) => {
        if (!cancelled) setPdfError(e.message);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [record.id, token]);

  async function setVerified(verify) {
    setBusy(true);
    setActionError("");
    try {
      const updated = await apiJson(`/records/${record.id}/${verify ? "verify" : "unverify"}`, {
        method: "POST",
        token,
      });
      onChanged(updated);
    } catch (e) {
      if (e.status === 401 && onUnauthorized) onUnauthorized();
      else setActionError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="record-head">
        <h2>
          {TYPE_ICONS[record.document_type] || "📄"} {TYPE_LABELS[record.document_type] || record.document_type} ·{" "}
          {formatDate(record.document_date)}
        </h2>
        <button className="btn secondary small" onClick={onClose}>
          ✕ Close
        </button>
      </div>

      <div className="verify-box">
        {record.verified ? (
          <>
            <VerificationNote record={record} />
            <button className="btn secondary small" disabled={busy} onClick={() => setVerified(false)}>
              Remove verification
            </button>
          </>
        ) : record.extraction_status === "failed" ? (
          <span className="muted">Nothing could be extracted from this document, so it cannot be verified.</span>
        ) : (
          <>
            <div>
              <strong>Step 1:</strong> compare the extracted information (left) with the original (right).
              <br />
              <strong>Step 2:</strong> if everything matches, confirm it.
            </div>
            <button className="btn" disabled={busy} onClick={() => setVerified(true)}>
              ✔ Mark as verified
            </button>
          </>
        )}
      </div>
      {actionError && <div className="error">{actionError}</div>}

      <div className="split">
        <div>
          <div className="label">Extracted information</div>
          <div>{record.source_name || "Source not found"}</div>
          <RecordInfo record={record} showNote={false} />
        </div>
        <div>
          <div className="label">Original document ({record.original_filename})</div>
          {pdfError && <div className="error">{pdfError}</div>}
          {!url && !pdfError && <p className="muted">Loading document...</p>}
          {url && <iframe className="pdf" src={url} title="Original document" />}
        </div>
      </div>
    </div>
  );
}