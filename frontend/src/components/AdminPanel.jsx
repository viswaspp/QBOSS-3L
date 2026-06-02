import { useCallback, useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { listUsers, createUser, deleteUser, getDbStatus, getDbAudit, deleteModality } from "../utils/api";

const MODALITIES = [
  { key: "face",    label: "Face",    icon: "👤", color: "purple" },
  { key: "hand",    label: "Hand",    icon: "✋", color: "cyan"   },
  { key: "gesture", label: "Gesture", icon: "🤙", color: "pink"   },
  { key: "voice",   label: "Voice",   icon: "🎙️", color: "green"  },
];

const ACTION_ICONS = { enroll: "📥", "re-enroll": "🔄", verify: "🔍", delete: "🗑️" };

function fmt(s) {
  if (!s) return "—";
  try { return new Date(s).toLocaleString(); } catch { return s; }
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`db-toast ${toast.ok ? "db-toast-ok" : "db-toast-err"}`}>
      {toast.ok ? "✅" : "❌"} {toast.msg}
    </div>
  );
}

function useToast() {
  const [toast, setToast] = useState(null);
  const show = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };
  return [toast, show];
}

function AdminOverview({ users }) {
  const totalEnrolled = users.reduce((s, u) => s + (u.enrolled_count || 0), 0);
  const fullyEnrolled = users.filter(u => u.enrolled_count === 4).length;
  return (
    <div className="animate-fadeIn">
      <div className="admin-page-header">
        <h2 className="admin-page-title">Overview</h2>
        <p className="admin-page-sub">System-wide biometric enrollment status</p>
      </div>
      <div className="admin-stats-grid stagger" style={{ marginBottom: "1.5rem" }}>
        {[
          { icon: "👥", label: "Total Users",       val: users.length,    color: "#818cf8" },
          { icon: "🔐", label: "Fully Enrolled",    val: fullyEnrolled,   color: "#10b981" },
          { icon: "📊", label: "Total Templates",   val: totalEnrolled,   color: "#06b6d4" },
          { icon: "⚠️", label: "Partial Profiles",  val: users.filter(u => u.enrolled_count > 0 && u.enrolled_count < 4).length, color: "#f59e0b" },
        ].map(s => (
          <div key={s.label} className="admin-stat-card">
            <div className="admin-stat-icon" style={{ background: s.color + "20", color: s.color }}>{s.icon}</div>
            <div className="admin-stat-body">
              <div className="admin-stat-val">{s.val}</div>
              <div className="admin-stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="glass-card">
        <h3 className="admin-section-title">All User Profiles</h3>
        {users.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>No users registered yet.</p>
        ) : (
          <div className="admin-profile-list">
            {users.map(u => (
              <div key={u.id} className={`admin-profile-row ${u.enrolled_count === 4 ? "enrolled" : ""}`}>
                <div className="admin-profile-icon db-icon-purple" style={{ fontFamily: "var(--font-mono)", fontSize: "0.9rem" }}>
                  U{u.id}
                </div>
                <div className="admin-profile-info">
                  <span className="admin-profile-name">{u.display_name || u.username}</span>
                  <span className="admin-profile-date">@{u.username} · joined {fmt(u.created_at)}</span>
                </div>
                <div style={{ display: "flex", gap: "0.35rem" }}>
                  {MODALITIES.map(m => (
                    <span key={m.key} title={m.label} style={{
                      fontSize: "0.9rem", opacity: u.enrolled?.[m.key] ? 1 : 0.2
                    }}>{m.icon}</span>
                  ))}
                </div>
                <span className={`status-badge ${u.enrolled_count === 4 ? "enrolled" : u.enrolled_count > 0 ? "partial" : "not-enrolled"}`}>
                  <span className="status-dot" />
                  {u.enrolled_count}/4
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AdminUsers({ users, onRefresh }) {
  const [toast, showToast] = useToast();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!username.trim()) return;
    setCreating(true);
    try {
      const r = await createUser(username.trim(), displayName.trim());
      if (r.success) { showToast(`User '${username}' created!`); setUsername(""); setDisplayName(""); onRefresh(); }
      else showToast(r.error, false);
    } finally { setCreating(false); }
  };

  const handleDelete = async (u) => {
    setDeleting(u.id);
    try {
      const r = await deleteUser(u.id);
      showToast(r.success ? `User '${u.username}' deleted.` : "Delete failed.", r.success);
      if (r.success) onRefresh();
    } finally { setDeleting(null); setConfirmDel(null); }
  };

  return (
    <div className="animate-fadeIn">
      <Toast toast={toast} />
      <div className="admin-page-header">
        <h2 className="admin-page-title">Users</h2>
        <p className="admin-page-sub">Create and manage enrolled user profiles</p>
      </div>

      <div className="glass-card" style={{ marginBottom: "1.5rem" }}>
        <h3 className="admin-section-title">Create New User</h3>
        <form onSubmit={handleCreate} className="admin-create-form">
          <input className="admin-input" placeholder="Username (e.g. alice)" value={username}
            onChange={e => setUsername(e.target.value)} required />
          <input className="admin-input" placeholder="Display Name (optional)" value={displayName}
            onChange={e => setDisplayName(e.target.value)} />
          <button className="btn btn-primary" type="submit" disabled={creating}>
            {creating ? "Creating…" : "+ Create User"}
          </button>
        </form>
      </div>

      <div className="glass-card">
        <h3 className="admin-section-title">Registered Users ({users.length})</h3>
        {users.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>No users yet.</p>
        ) : (
          <div className="admin-users-table-wrap">
            <table className="admin-users-table">
              <thead><tr><th>ID</th><th>Username</th><th>Display Name</th><th>Enrolled</th><th>Joined</th><th>Action</th></tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td className="audit-id">#{u.id}</td>
                    <td><strong>@{u.username}</strong></td>
                    <td style={{ color: "var(--text-muted)" }}>{u.display_name || "—"}</td>
                    <td>
                      <div style={{ display: "flex", gap: "0.3rem" }}>
                        {MODALITIES.map(m => (
                          <span key={m.key} title={m.label} style={{ fontSize: "0.95rem", opacity: u.enrolled?.[m.key] ? 1 : 0.2 }}>{m.icon}</span>
                        ))}
                      </div>
                    </td>
                    <td className="audit-time">{fmt(u.created_at)}</td>
                    <td>
                      {confirmDel === u.id ? (
                        <span style={{ display: "flex", gap: "0.4rem" }}>
                          <button className="btn btn-danger" style={{ fontSize: "0.72rem", padding: "0.25rem 0.6rem" }}
                            disabled={deleting === u.id} onClick={() => handleDelete(u)}>
                            {deleting === u.id ? "…" : "Confirm"}
                          </button>
                          <button className="btn btn-ghost" style={{ fontSize: "0.72rem", padding: "0.25rem 0.6rem" }}
                            onClick={() => setConfirmDel(null)}>Cancel</button>
                        </span>
                      ) : (
                        <button className="btn btn-ghost" style={{ fontSize: "0.72rem", padding: "0.25rem 0.6rem", color: "var(--accent-red)", borderColor: "rgba(239,68,68,0.2)" }}
                          onClick={() => setConfirmDel(u.id)}>Delete</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AdminDatabase({ users }) {
  const [selectedUser, setSelectedUser] = useState(null);
  const [dbData, setDbData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [toast, showToast] = useToast();

  const loadUser = async (u) => {
    setSelectedUser(u); setLoading(true);
    try {
      const r = await getDbStatus(u.id);
      setDbData(r);
    } finally { setLoading(false); }
  };

  const handleDelete = async (modality) => {
    setDeleting(modality);
    try {
      const r = await deleteModality(selectedUser.id, modality);
      showToast(r.success ? r.message : r.error, r.success);
      if (r.success) await loadUser(selectedUser);
    } finally { setDeleting(null); setConfirmDel(null); }
  };

  return (
    <div className="animate-fadeIn">
      <Toast toast={toast} />
      <div className="admin-page-header">
        <h2 className="admin-page-title">Database</h2>
        <p className="admin-page-sub">Encrypted biometric templates per user</p>
      </div>

      <div className="admin-user-selector">
        {users.map(u => (
          <button key={u.id} className={`admin-user-chip ${selectedUser?.id === u.id ? "active" : ""}`}
            onClick={() => loadUser(u)}>
            <span>👤</span> {u.display_name || u.username}
            <span className="chip-count">{u.enrolled_count}/4</span>
          </button>
        ))}
      </div>

      {!selectedUser && <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: "1rem" }}>Select a user above to view their biometric templates.</p>}

      {selectedUser && loading && <div className="db-loading"><div className="db-spinner" /><span>Loading…</span></div>}

      {selectedUser && !loading && dbData && (
        <div className="db-modality-grid stagger" style={{ marginTop: "1.25rem" }}>
          {MODALITIES.map(m => {
            const enrolled = dbData.enrolled?.[m.key] ?? false;
            const meta     = dbData.meta?.[m.key] ?? {};
            return (
              <div key={m.key} className={`db-modality-card db-card-${m.color} ${enrolled ? "enrolled" : "empty"}`}>
                <div className="db-card-top">
                  <div className={`db-card-icon db-icon-${m.color}`}>{m.icon}</div>
                  <div className="db-card-title">
                    <h3>{m.label}</h3>
                    <span className={`status-badge ${enrolled ? "enrolled" : "not-enrolled"}`}>
                      <span className="status-dot" />{enrolled ? "Stored" : "Empty"}
                    </span>
                  </div>
                </div>
                {enrolled && meta.enrolled_at && (
                  <div className="db-meta-rows">
                    {[
                      ["Enrolled", fmt(meta.enrolled_at)],
                      ["Updated",  fmt(meta.updated_at)],
                      ["Version",  `v${meta.version}`],
                      ...(m.key === "face" && meta.sample_count ? [
                        ["Samples", meta.sample_count],
                        ["Quality", meta.quality_rating],
                        ["Similarity", meta.mean_intra_similarity != null ? `${(meta.mean_intra_similarity * 100).toFixed(1)}%` : "—"],
                      ] : []),
                      ...(m.key === "hand" && meta.kernel ? [["SVM Kernel", meta.kernel?.toUpperCase()]] : []),
                      ...(m.key === "gesture" && meta.sequence_length != null ? [["Seq Length", meta.sequence_length]] : []),
                      ...(m.key === "voice" && meta.sample_count != null ? [
                        ["Samples", meta.sample_count],
                        ["Feature Dim", `${meta.feature_dim}D`],
                      ] : []),
                    ].map(([label, val]) => (
                      <div key={label} className="db-meta-row">
                        <span className="db-meta-label">{label}</span>
                        <span className="db-meta-value">{val ?? "—"}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="db-security-footer">
                  <span className="db-sec-pill">🔐 AES-256</span>
                  <span className="db-sec-pill">🔏 SHA-256</span>
                </div>
                {enrolled && (
                  <div className="db-delete-area">
                    {confirmDel === m.key ? (
                      <div className="db-confirm-row">
                        <span className="db-confirm-label">Permanently delete?</span>
                        <button className="btn btn-danger" style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
                          disabled={deleting === m.key} onClick={() => handleDelete(m.key)}>
                          {deleting === m.key ? "…" : "Yes"}
                        </button>
                        <button className="btn btn-ghost" style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
                          onClick={() => setConfirmDel(null)}>No</button>
                      </div>
                    ) : (
                      <button className="btn btn-ghost admin-delete-btn" onClick={() => setConfirmDel(m.key)}>
                        🗑️ Remove
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AdminAudit({ users }) {
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await getDbAudit(200); setLog(r.log || []); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const filtered = log.filter(e =>
    (filter === "all" || e.action === filter) &&
    (userFilter === "all" || String(e.user_id) === userFilter)
  );

  return (
    <div className="animate-fadeIn">
      <div className="admin-page-header">
        <h2 className="admin-page-title">Audit Log</h2>
        <p className="admin-page-sub">Append-only record of all system events</p>
      </div>
      <div className="glass-card">
        <div className="db-audit-header">
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{filtered.length} entries shown</p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <select className="admin-filter-select" value={userFilter} onChange={e => setUserFilter(e.target.value)}>
              <option value="all">All Users</option>
              {users.map(u => <option key={u.id} value={String(u.id)}>@{u.username}</option>)}
            </select>
            <select className="admin-filter-select" value={filter} onChange={e => setFilter(e.target.value)}>
              <option value="all">All Actions</option>
              <option value="enroll">Enroll</option>
              <option value="re-enroll">Re-enroll</option>
              <option value="verify">Verify</option>
              <option value="delete">Delete</option>
            </select>
            <button className="btn btn-ghost" style={{ fontSize: "0.8rem" }} onClick={load}>↻</button>
          </div>
        </div>
        {loading ? <div className="db-loading"><div className="db-spinner" /></div> : (
          filtered.length === 0 ? <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: "1rem" }}>No entries.</p> : (
            <div className="db-audit-table-wrap" style={{ marginTop: "1rem" }}>
              <table className="db-audit-table">
                <thead><tr><th>#</th><th>User</th><th>Modality</th><th>Action</th><th>Result</th><th>Time</th><th>Detail</th></tr></thead>
                <tbody>
                  {filtered.map(e => (
                    <tr key={e.id} className={e.success ? "audit-ok" : "audit-fail"}>
                      <td className="audit-id">{e.id}</td>
                      <td><span className="audit-modality">@{e.username || `#${e.user_id}`}</span></td>
                      <td><span className="audit-modality">{MODALITIES.find(m => m.key === e.modality)?.icon || "•"} {e.modality}</span></td>
                      <td><span className="audit-action">{ACTION_ICONS[e.action] || "•"} {e.action}</span></td>
                      <td><span className={`audit-result ${e.success ? "ok" : "fail"}`}>{e.success ? "✓" : "✗"}</span></td>
                      <td className="audit-time">{fmt(e.timestamp)}</td>
                      <td className="audit-detail">{e.detail || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function AdminDanger({ users, onRefresh }) {
  const [toast, showToast] = useToast();
  const [selectedUser, setSelectedUser] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const handleDeleteModality = async (modality) => {
    if (!selectedUser) return;
    setDeleting(modality);
    try {
      const r = await deleteModality(selectedUser.id, modality);
      showToast(r.success ? r.message : r.error, r.success);
      if (r.success) onRefresh();
    } finally { setDeleting(null); setConfirmDel(null); }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    setDeleting("user");
    try {
      const r = await deleteUser(selectedUser.id);
      showToast(r.success ? `User '${selectedUser.username}' wiped.` : "Failed.", r.success);
      if (r.success) { setSelectedUser(null); onRefresh(); }
    } finally { setDeleting(null); setConfirmWipe(false); }
  };

  return (
    <div className="animate-fadeIn">
      <Toast toast={toast} />
      <div className="admin-page-header">
        <h2 className="admin-page-title" style={{ color: "var(--accent-red)" }}>⚠️ Danger Zone</h2>
        <p className="admin-page-sub">Irreversible actions — deleted data cannot be recovered</p>
      </div>

      <div className="admin-danger-banner" style={{ marginBottom: "1.5rem" }}>
        <span className="admin-danger-icon">⚠️</span>
        <div><strong>All deletions are permanent</strong><p>Select a user then choose which data to remove.</p></div>
      </div>

      <div className="admin-user-selector" style={{ marginBottom: "1.5rem" }}>
        {users.map(u => (
          <button key={u.id} className={`admin-user-chip ${selectedUser?.id === u.id ? "active danger" : ""}`}
            onClick={() => { setSelectedUser(u); setConfirmDel(null); setConfirmWipe(false); }}>
            <span>👤</span> {u.display_name || u.username}
          </button>
        ))}
      </div>

      {selectedUser && (
        <>
          <div className="glass-card" style={{ marginBottom: "1.5rem" }}>
            <h3 className="admin-section-title">Remove Single Modality — @{selectedUser.username}</h3>
            <div className="admin-danger-list">
              {MODALITIES.map(m => {
                const has = selectedUser.enrolled?.[m.key];
                return (
                  <div key={m.key} className={`admin-danger-row ${!has ? "disabled" : ""}`}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <div className={`db-card-icon db-icon-${m.color}`} style={{ width: 36, height: 36, fontSize: "1.1rem" }}>{m.icon}</div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{m.label}</div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{has ? "Enrolled" : "Not enrolled"}</div>
                      </div>
                    </div>
                    {has && (confirmDel === m.key ? (
                      <div style={{ display: "flex", gap: "0.4rem" }}>
                        <button className="btn btn-danger" style={{ fontSize: "0.75rem" }}
                          disabled={deleting === m.key} onClick={() => handleDeleteModality(m.key)}>
                          {deleting === m.key ? "…" : "Confirm"}
                        </button>
                        <button className="btn btn-ghost" style={{ fontSize: "0.75rem" }}
                          onClick={() => setConfirmDel(null)}>Cancel</button>
                      </div>
                    ) : (
                      <button className="btn btn-ghost" style={{ fontSize: "0.8rem", color: "var(--accent-red)", borderColor: "rgba(239,68,68,0.25)" }}
                        onClick={() => setConfirmDel(m.key)}>🗑️ Delete</button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="glass-card admin-wipe-card">
            <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
              <span style={{ fontSize: "2rem" }}>💣</span>
              <div style={{ flex: 1 }}>
                <h3 style={{ color: "var(--accent-red)", fontFamily: "var(--font-display)", fontSize: "1rem", marginBottom: "0.35rem" }}>
                  Delete User & All Data — @{selectedUser.username}
                </h3>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
                  Permanently removes this user account and all associated biometric templates from the database.
                </p>
                {confirmWipe ? (
                  <div style={{ display: "flex", gap: "0.75rem" }}>
                    <button className="btn btn-danger" disabled={deleting === "user"} onClick={handleDeleteUser}>
                      {deleting === "user" ? "Deleting…" : `💣 Delete @${selectedUser.username}`}
                    </button>
                    <button className="btn btn-ghost" onClick={() => setConfirmWipe(false)}>Cancel</button>
                  </div>
                ) : (
                  <button className="btn btn-ghost" style={{ color: "var(--accent-red)", borderColor: "rgba(239,68,68,0.3)" }}
                    onClick={() => setConfirmWipe(true)}>
                    Delete User Account
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadUsers = useCallback(async () => {
    try { const r = await listUsers(); setUsers(r.users || []); }
    catch { setUsers([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { loadUsers(); }, 0);
    return () => clearTimeout(timer);
  }, [loadUsers]);

  if (loading) return <div className="db-loading"><div className="db-spinner" /><span>Loading…</span></div>;

  return (
    <Routes>
      <Route index element={<AdminOverview users={users} />} />
      <Route path="users" element={<AdminUsers users={users} onRefresh={loadUsers} />} />
      <Route path="database" element={<AdminDatabase users={users} />} />
      <Route path="audit" element={<AdminAudit users={users} />} />
      <Route path="danger" element={<AdminDanger users={users} onRefresh={loadUsers} />} />
    </Routes>
  );
}
