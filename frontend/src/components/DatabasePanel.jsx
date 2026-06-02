import { useCallback, useEffect, useState } from "react";
import { deleteModality, getDbAudit, getDbStatus } from "../utils/api";

const MODALITIES = [
  { key: "face",    label: "Face Recognition", icon: "👤", color: "purple" },
  { key: "hand",    label: "Hand Biometric",   icon: "✋", color: "cyan"   },
  { key: "gesture", label: "Gesture Password", icon: "🤙", color: "pink"   },
  { key: "voice",   label: "Voice Print",      icon: "🎙️", color: "green"  },
];

const ACTION_ICONS = { enroll: "📥", "re-enroll": "🔄", verify: "🔍", delete: "🗑️" };

function fmt(isoStr) {
  if (!isoStr) return "—";
  try {
    return new Date(isoStr).toLocaleString();
  } catch { return isoStr; }
}

export default function DatabasePanel() {
  const [dbData, setDbData]         = useState(null);
  const [auditLog, setAuditLog]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [deleting, setDeleting]     = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [toast, setToast]           = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [status, log] = await Promise.all([getDbStatus(), getDbAudit(60)]);
      setDbData(status);
      setAuditLog(log.log || []);
    } catch {
      setError("Cannot reach backend. Is the server running on port 5001?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const handleDelete = async (modality) => {
    setDeleting(modality);
    try {
      const res = await deleteModality(modality);
      if (res.success) {
        showToast(res.message, true);
        await load();
      } else {
        showToast(res.error || "Delete failed", false);
      }
    } catch {
      showToast("Network error", false);
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  };

  return (
    <div className="animate-fadeIn">
      {/* Toast */}
      {toast && (
        <div className={`db-toast ${toast.ok ? "db-toast-ok" : "db-toast-err"}`}>
          {toast.ok ? "✅" : "❌"} {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="page-header">
        <h2>Biometric Database</h2>
        <p>Encrypted SQLite store — AES-256 Fernet · SHA-256 integrity</p>
      </div>

      {error && (
        <div className="error-banner" style={{ marginBottom: "1.5rem" }}>
          <div className="error-icon">⚠️</div>
          <div className="error-text">{error}</div>
        </div>
      )}

      {loading ? (
        <div className="db-loading">
          <div className="db-spinner" />
          <span>Loading database…</span>
        </div>
      ) : (
        <>
          {/* Enrollment cards */}
          <div className="db-modality-grid stagger">
            {MODALITIES.map((m) => {
              const enrolled = dbData?.enrolled?.[m.key] ?? false;
              const meta     = dbData?.meta?.[m.key] ?? {};
              const isConfirm = confirmDelete === m.key;
              return (
                <div key={m.key} className={`db-modality-card db-card-${m.color} ${enrolled ? "enrolled" : "empty"}`}>
                  <div className="db-card-top">
                    <div className={`db-card-icon db-icon-${m.color}`}>{m.icon}</div>
                    <div className="db-card-title">
                      <h3>{m.label}</h3>
                      <span className={`status-badge ${enrolled ? "enrolled" : "not-enrolled"}`}>
                        <span className="status-dot" />
                        {enrolled ? "Stored" : "Not Enrolled"}
                      </span>
                    </div>
                  </div>

                  {enrolled && meta.enrolled_at && (
                    <div className="db-meta-rows">
                      <div className="db-meta-row">
                        <span className="db-meta-label">Enrolled</span>
                        <span className="db-meta-value">{fmt(meta.enrolled_at)}</span>
                      </div>
                      <div className="db-meta-row">
                        <span className="db-meta-label">Updated</span>
                        <span className="db-meta-value">{fmt(meta.updated_at)}</span>
                      </div>
                      <div className="db-meta-row">
                        <span className="db-meta-label">Version</span>
                        <span className="db-meta-value">v{meta.version}</span>
                      </div>

                      {/* modality-specific meta */}
                      {m.key === "face" && meta.sample_count && (
                        <>
                          <div className="db-meta-row">
                            <span className="db-meta-label">Samples</span>
                            <span className="db-meta-value">{meta.sample_count}</span>
                          </div>
                          <div className="db-meta-row">
                            <span className="db-meta-label">Quality</span>
                            <span className={`face-quality-badge quality-${meta.quality_rating?.toLowerCase()}`}>
                              {meta.quality_rating}
                            </span>
                          </div>
                          <div className="db-meta-row">
                            <span className="db-meta-label">Similarity</span>
                            <span className="db-meta-value">
                              {meta.mean_intra_similarity != null
                                ? `${(meta.mean_intra_similarity * 100).toFixed(1)}%`
                                : "—"}
                            </span>
                          </div>
                        </>
                      )}
                      {m.key === "hand" && meta.kernel && (
                        <div className="db-meta-row">
                          <span className="db-meta-label">SVM Kernel</span>
                          <span className="db-meta-value">{meta.kernel?.toUpperCase()}</span>
                        </div>
                      )}
                      {m.key === "gesture" && meta.sequence_length != null && (
                        <div className="db-meta-row">
                          <span className="db-meta-label">Seq. Length</span>
                          <span className="db-meta-value">{meta.sequence_length}</span>
                        </div>
                      )}
                      {m.key === "voice" && meta.sample_count != null && (
                        <>
                          <div className="db-meta-row">
                            <span className="db-meta-label">Samples</span>
                            <span className="db-meta-value">{meta.sample_count}</span>
                          </div>
                          <div className="db-meta-row">
                            <span className="db-meta-label">Feature Dim</span>
                            <span className="db-meta-value">{meta.feature_dim}D</span>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Security footer */}
                  <div className="db-security-footer">
                    <span className="db-sec-pill">🔐 AES-256</span>
                    <span className="db-sec-pill">🔏 SHA-256 hash</span>
                  </div>

                  {/* Delete controls */}
                  {enrolled && (
                    <div className="db-delete-area">
                      {isConfirm ? (
                        <div className="db-confirm-row">
                          <span className="db-confirm-label">Delete this enrollment?</span>
                          <button
                            className="btn btn-danger"
                            style={{ fontSize: "0.75rem", padding: "0.35rem 0.75rem" }}
                            disabled={deleting === m.key}
                            onClick={() => handleDelete(m.key)}
                          >
                            {deleting === m.key ? "Deleting…" : "Yes, delete"}
                          </button>
                          <button
                            className="btn btn-ghost"
                            style={{ fontSize: "0.75rem", padding: "0.35rem 0.75rem" }}
                            onClick={() => setConfirmDelete(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: "0.75rem", color: "var(--accent-red)", borderColor: "rgba(239,68,68,0.2)", width: "100%" }}
                          onClick={() => setConfirmDelete(m.key)}
                        >
                          🗑️ Remove Enrollment
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Audit Log */}
          <div className="glass-card" style={{ marginTop: "2rem" }}>
            <div className="db-audit-header">
              <div>
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1rem", marginBottom: "0.25rem" }}>
                  🗂️ Audit Log
                </h3>
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  Append-only record of all enroll / verify / delete actions
                </p>
              </div>
              <button className="btn btn-ghost" style={{ fontSize: "0.8rem" }} onClick={load}>
                ↻ Refresh
              </button>
            </div>

            {auditLog.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "1rem" }}>
                No audit entries yet.
              </p>
            ) : (
              <div className="db-audit-table-wrap">
                <table className="db-audit-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Modality</th>
                      <th>Action</th>
                      <th>Result</th>
                      <th>Timestamp</th>
                      <th>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLog.map((entry) => (
                      <tr key={entry.id} className={entry.success ? "audit-ok" : "audit-fail"}>
                        <td className="audit-id">{entry.id}</td>
                        <td>
                          <span className="audit-modality">
                            {MODALITIES.find(m => m.key === entry.modality)?.icon || "•"}{" "}
                            {entry.modality}
                          </span>
                        </td>
                        <td>
                          <span className="audit-action">
                            {ACTION_ICONS[entry.action] || "•"} {entry.action}
                          </span>
                        </td>
                        <td>
                          <span className={`audit-result ${entry.success ? "ok" : "fail"}`}>
                            {entry.success ? "✓ Pass" : "✗ Fail"}
                          </span>
                        </td>
                        <td className="audit-time">{fmt(entry.timestamp)}</td>
                        <td className="audit-detail">{entry.detail || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* DB file info */}
          <div className="glass-card db-info-card" style={{ marginTop: "1.5rem" }}>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: "0.9rem", marginBottom: "0.75rem" }}>
              🛡️ Storage Security Details
            </h3>
            <div className="db-info-grid">
              <div className="db-info-item">
                <span className="db-info-label">Database File</span>
                <span className="db-info-value">models/qboss_biometrics.db</span>
              </div>
              <div className="db-info-item">
                <span className="db-info-label">Encryption</span>
                <span className="db-info-value">AES-256-CBC via Fernet</span>
              </div>
              <div className="db-info-item">
                <span className="db-info-label">Key File</span>
                <span className="db-info-value">models/db_key.key (chmod 600)</span>
              </div>
              <div className="db-info-item">
                <span className="db-info-label">Integrity Check</span>
                <span className="db-info-value">SHA-256 per blob</span>
              </div>
              <div className="db-info-item">
                <span className="db-info-label">Face Template</span>
                <span className="db-info-value">128-D OpenCV descriptor (1 024 bytes)</span>
              </div>
              <div className="db-info-item">
                <span className="db-info-label">Audit Table</span>
                <span className="db-info-value">Append-only, never deleted</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
