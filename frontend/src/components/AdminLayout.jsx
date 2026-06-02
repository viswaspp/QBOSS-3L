import { NavLink } from "react-router-dom";

export default function AdminLayout({ children }) {
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-top">
          <div className="admin-sidebar-brand">
            <span className="admin-brand-icon">🛡️</span>
            <div>
              <h1 className="admin-brand-title">QBOSS-3L</h1>
              <span className="admin-brand-sub">Admin Console</span>
            </div>
          </div>

          <nav className="admin-nav">
            <div className="admin-nav-label">Management</div>
            <NavLink to="/admin" end className={({ isActive }) => `admin-nav-link ${isActive ? "active" : ""}`}>
              <span>📊</span> Overview
            </NavLink>
            <NavLink to="/admin/users" className={({ isActive }) => `admin-nav-link ${isActive ? "active" : ""}`}>
              <span>👥</span> Users
            </NavLink>
            <NavLink to="/admin/database" className={({ isActive }) => `admin-nav-link ${isActive ? "active" : ""}`}>
              <span>🗄️</span> Database
            </NavLink>
            <NavLink to="/admin/audit" className={({ isActive }) => `admin-nav-link ${isActive ? "active" : ""}`}>
              <span>🗂️</span> Audit Log
            </NavLink>
            <NavLink to="/admin/danger" className={({ isActive }) => `admin-nav-link ${isActive ? "active" : ""}`}>
              <span>⚠️</span> Danger Zone
            </NavLink>
          </nav>
        </div>

        <div className="admin-sidebar-footer">
          <NavLink to="/" className="admin-back-link">
            ← Back to Vault
          </NavLink>
        </div>
      </aside>

      <main className="admin-main">
        {children}
      </main>
    </div>
  );
}
