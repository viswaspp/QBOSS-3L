import { NavLink, Outlet } from "react-router-dom";

export default function Layout() {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="lock-icon-wrap">
            <span className="lock-icon-main">🔐</span>
          </div>
          <h1>QBOSS-3L</h1>
          <p>Biometric Vault</p>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-title">System</div>
          <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            <span className="nav-icon">🔒</span>
            Verify &amp; Unlock
          </NavLink>
          <NavLink to="/enroll" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            <span className="nav-icon">📋</span>
            Enrollment
          </NavLink>
          <NavLink to="/admin" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            <span className="nav-icon">🛡️</span>
            Admin Panel
          </NavLink>

          <div className="nav-section-title">Auth Levels</div>
          <div className="nav-level-info">
            <div className="level-info-row"><span className="level-dot" style={{ background: "var(--accent-purple)" }} /><span>L1 - Face</span></div>
            <div className="level-info-row"><span className="level-dot hand" /><span>L2 - Hand</span></div>
            <div className="level-info-row"><span className="level-dot gesture" /><span>L3 - Gesture</span></div>
            <div className="level-info-row"><span className="level-dot voice" /><span>L4 - Voice</span></div>
          </div>
        </nav>

        <div className="sidebar-footer">
          <span className="status-badge enrolled">
            <span className="status-dot" />
            Live Mode
          </span>
        </div>
      </aside>

      <main className="main-content"><Outlet /></main>
    </div>
  );
}
