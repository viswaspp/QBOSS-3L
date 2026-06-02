import { useState, useCallback, useEffect } from "react";
import { getVoiceChallenge, verifyVoice, listUsers } from "../utils/api";
import { recordWav } from "../utils/audio";

export default function VoiceVerify() {
  const [status, setStatus] = useState("idle");
  const [challenge, setChallenge] = useState(null);
  const [recording, setRecording] = useState(false);
  const [waveHeights, setWaveHeights] = useState(Array(30).fill(10));
  const [distance, setDistance] = useState(null);
  const [message, setMessage] = useState("");
  const [userId, setUserId] = useState(null);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    listUsers().then(r => setUsers(r.users || [])).catch(() => {});
  }, []);

  const fetchChallenge = useCallback(async () => {
    try {
      const data = await getVoiceChallenge();
      setChallenge(data);
    } catch {
      setChallenge({ challenge: "Say: secure 77", expected: "secure 77" });
    }
  }, []);

  const startChallenge = async () => {
    await fetchChallenge();
    setStatus("challenge");
    setMessage("");
    setDistance(null);
  };

  const startRecording = async () => {
    let waveInterval = null;
    try {
      setRecording(true);
      setStatus("recording");
      setMessage("Speak now...");
      waveInterval = setInterval(() => {
        setWaveHeights(Array(30).fill(0).map(() => Math.random() * 55 + 5));
      }, 100);

      const blob = await recordWav(4000);
      clearInterval(waveInterval);
      setRecording(false);
      setStatus("processing");
      setMessage("Analyzing QNV phase projection, acoustic signature, and liveness...");

      const result = await verifyVoice(userId, blob, challenge);
      setDistance(result.distance);
      setStatus(result.verified ? "verified" : "denied");
      setMessage(result.message || result.error || "Voice verification finished");
    } catch (error) {
      if (waveInterval) clearInterval(waveInterval);
      setRecording(false);
      setStatus("denied");
      setMessage(error.message || "Microphone access denied");
    }
  };

  const reset = () => {
    setStatus("idle");
    setChallenge(null);
    setRecording(false);
    setWaveHeights(Array(30).fill(10));
    setDistance(null);
    setMessage("");
    // keep userId selected for re-attempts
  };

  return (
    <div className="verify-container animate-fadeInUp">
      <div className="page-header">
        <h2>Level 3 - Voice + QNV</h2>
        <p>Quantum Noise Voice verification with stochastic projection and challenge freshness</p>
      </div>

      {/* User picker */}
      <div className="glass-card" style={{ marginBottom: "1rem" }}>
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: "0.85rem", marginBottom: "0.6rem" }}>👤 Select User</h3>
        {users.length === 0 ? (
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>No users. <a href="/admin" style={{ color: "var(--accent-purple)" }}>Create one →</a></p>
        ) : (
          <div className="admin-user-selector">
            {users.map(u => (
              <button key={u.id}
                className={`admin-user-chip ${userId === u.id ? "active" : ""}`}
                onClick={() => setUserId(u.id)}>
                <span>👤</span>{u.display_name || u.username}
              </button>
            ))}
          </div>
        )}
      </div>

      {challenge && (
        <div className="challenge-display">
          <div className="challenge-label">Voice Challenge</div>
          <div className="challenge-text">{challenge.challenge}</div>
        </div>
      )}

      <div className="waveform-container">
        {waveHeights.map((height, index) => (
          <div
            key={index}
            className={`wave-bar ${recording ? "active" : ""}`}
            style={{
              height: `${height}px`,
              animationDelay: `${index * 0.05}s`,
              opacity: recording ? 1 : 0.3,
            }}
          />
        ))}
      </div>

      {(status === "recording" || status === "idle" || status === "challenge") && (
        <div style={{ textAlign: "center" }}>
          <button
            className={`record-btn ${recording ? "recording" : ""}`}
            onClick={() => {
              if (status === "challenge") startRecording();
            }}
            disabled={status !== "challenge"}
            style={{ opacity: status === "challenge" ? 1 : 0.4 }}
            aria-label="Record voice sample"
          />
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
            {status === "challenge" ? "Tap to record" : status === "recording" ? "Recording... (5s)" : "Start a challenge first"}
          </p>
        </div>
      )}

      {distance !== null && (
        <div className="glass-card" style={{ marginTop: "1rem" }}>
          <div className="confidence-meter">
            <div className="label">
              <span>QNV Fusion Distance</span>
              <span>{distance}</span>
            </div>
            <div className="meter-track">
              <div
                className="meter-fill"
                style={{
                  width: `${Math.max(0, 100 - distance)}%`,
                  background: distance < 90 ? "var(--gradient-success)" : "var(--gradient-danger)",
                }}
              />
            </div>
          </div>
          <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
            Lower distance = stronger match | QNV, acoustic, quality, and replay checks are fused
          </p>
        </div>
      )}

      {message && status !== "verified" && status !== "denied" && (
        <div className="glass-card" style={{ textAlign: "center", marginTop: "1rem" }}>
          <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
            {status === "processing" ? "Processing... " : ""}{message}
          </p>
        </div>
      )}

      {(status === "verified" || status === "denied") && (
        <div className={`result-panel ${status === "verified" ? "success" : "failure"}`}>
          <div className="result-icon">{status === "verified" ? "OK" : "X"}</div>
          <h3>{status === "verified" ? "Voice Verified" : "Access Denied"}</h3>
          <p>{message}</p>
        </div>
      )}

      <div style={{ display: "flex", gap: "1rem", justifyContent: "center", marginTop: "1.5rem" }}>
        {status === "idle" && (
          <button
            className="btn btn-primary btn-lg"
            onClick={startChallenge}
            disabled={!userId}
            style={{ opacity: userId ? 1 : 0.5 }}
          >
            Start Voice Challenge
          </button>
        )}
        {(status === "verified" || status === "denied") && (
          <button className="btn btn-ghost btn-lg" onClick={reset}>
            Try Again
          </button>
        )}
      </div>
    </div>
  );
}
