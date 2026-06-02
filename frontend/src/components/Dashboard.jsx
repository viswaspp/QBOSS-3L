import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { fetchModelsStatus, fetchStatus } from "../utils/api";

export default function Dashboard() {
  const [apiOnline, setApiOnline] = useState(false);
  const [models, setModels] = useState({ hand_enrolled: false, gesture_enrolled: false, voice_enrolled: false });

  useEffect(() => {
    fetchStatus().then(() => setApiOnline(true)).catch(() => setApiOnline(false));
    fetchModelsStatus().then(setModels).catch(() => {});
  }, []);

  const levels = [
    {
      key: "hand",
      title: "Hand Biometric",
      desc: "SVM-based hand geometry verification using MediaPipe landmarks",
      icon: "H",
      className: "level-hand",
      enrolled: models.hand_enrolled,
      path: "/hand",
    },
    {
      key: "gesture",
      title: "Gesture Password",
      desc: "3-gesture sequence password using finger detection",
      icon: "G",
      className: "level-gesture",
      enrolled: models.gesture_enrolled,
      path: "/gesture",
    },
    {
      key: "voice",
      title: "Voice + QNV",
      desc: "MFCC voice features fused with Quantum Noise Vectors",
      icon: "V",
      className: "level-voice",
      enrolled: models.voice_enrolled,
      path: "/voice",
    },
  ];

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <h2>Authentication Dashboard</h2>
        <p>Multi-Factor Biometric Security - 3 Levels of Protection</p>
      </div>

      <div className="stats-grid stagger">
        <div className="stat-card">
          <div className="stat-label">System Status</div>
          <div className={`stat-value ${apiOnline ? "green" : "pink"}`}>
            {apiOnline ? "Online" : "Offline"}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Auth Levels</div>
          <div className="stat-value cyan">3</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Enrolled</div>
          <div className="stat-value purple">
            {[models.hand_enrolled, models.gesture_enrolled, models.voice_enrolled].filter(Boolean).length} / 3
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Mode</div>
          <div className="stat-value green">Live</div>
        </div>
      </div>

      <h3 style={{ fontFamily: "var(--font-display)", marginBottom: "1rem", fontSize: "1.1rem", color: "var(--text-secondary)" }}>
        Authentication Levels
      </h3>

      <div className="auth-levels stagger">
        {levels.map((level) => (
          <Link to={level.path} key={level.key} className={`level-card ${level.className}`}>
            <div className="level-icon">{level.icon}</div>
            <h3>{level.title}</h3>
            <p>{level.desc}</p>
            <div style={{ marginTop: "1rem" }}>
              <span className={`status-badge ${level.enrolled ? "enrolled" : "not-enrolled"}`}>
                <span className="status-dot"></span>
                {level.enrolled ? "Enrolled" : "Not Enrolled"}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
