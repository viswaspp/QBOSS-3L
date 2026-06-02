import { useState, useRef, useEffect, useCallback } from "react";
import {
  detectGesture,
  getVoiceChallenge,
  listUsers,
  processFaceFrame,
  processHandFrame,
  verifyFace,
  verifyGesture,
  verifyHand,
  verifyVoice,
} from "../utils/api";
import { recordWav } from "../utils/audio";

const GESTURE_LABELS = {
  fist: "Fist", palm: "Palm", peace: "Peace", point: "Point",
  three: "Three", five: "Five", rock: "Rock", two: "Two", ok: "OK",
};

const INITIAL_LEVELS = () => [
  { key: "face",    label: "Face Recognition",  icon: "👤", status: "pending", detail: "" },
  { key: "hand",    label: "Hand Biometric",    icon: "✋", status: "pending", detail: "" },
  { key: "gesture", label: "Gesture Password",  icon: "🤙", status: "pending", detail: "" },
  { key: "voice",   label: "Voice + QNV",       icon: "🎙", status: "pending", detail: "" },
];

export default function LockScreen() {
  const [vaultState, setVaultState] = useState("locked");
  const [currentLevel, setCurrentLevel] = useState(0);
  const [levels, setLevels] = useState(INITIAL_LEVELS());
  const [errorMsg, setErrorMsg] = useState("");

  // Face
  const [faceDetected, setFaceDetected] = useState(false);
  const [faceStable, setFaceStable]     = useState(0);
  const [faceConfidence, setFaceConfidence] = useState(0);

  // Hand
  const [handSamples, setHandSamples]       = useState(0);
  const [handConfidence, setHandConfidence] = useState(0);

  // Gesture
  const [gestureSeq, setGestureSeq]         = useState([]);
  const [currentGesture, setCurrentGesture] = useState(null);
  const [gestureHold, setGestureHold]       = useState(0);

  // Voice
  const [voiceChallenge, setVoiceChallenge] = useState(null);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [waveHeights, setWaveHeights]       = useState(Array(30).fill(8));
  const [voiceDistance, setVoiceDistance]   = useState(null);

  // User selection
  const [userId, setUserId]   = useState(null);
  const [users, setUsers]     = useState([]);

  const videoRef    = useRef(null);
  const streamRef   = useRef(null);
  const intervalRef = useRef(null);
  const busyRef     = useRef(false);
  const faceStableRef = useRef(0);

  useEffect(() => {
    listUsers().then(r => setUsers(r.users || [])).catch(() => {});
  }, []);

  const stopCamera = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (streamRef.current)   { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const waitForVideoElement = async (timeoutMs = 1500) => {
    const maxAttempts = Math.ceil(timeoutMs / 30);
    for (let attempt = 0; attempt < maxAttempts && !videoRef.current; attempt += 1) {
      await sleep(30);
    }
    return videoRef.current;
  };

  const updateLevel = (index, updates) =>
    setLevels((prev) => prev.map((l, i) => (i === index ? { ...l, ...updates } : l)));

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
      return null;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 640; canvas.height = 480;
    canvas.getContext("2d").drawImage(video, 0, 0, 640, 480);
    return canvas.toDataURL("image/jpeg", 0.7);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      const video = await waitForVideoElement();
      if (!video) {
        stopCamera();
        return false;
      }
      video.srcObject = stream;
      await video.play().catch(() => {});
      return true;
    } catch (err) {
      console.error("Camera access error:", err);
      return false;
    }
  };

  const failAt = (levelIndex, message) => {
    updateLevel(levelIndex, { status: "fail", detail: message });
    setErrorMsg(`Level ${levelIndex + 1} failed: ${message}`);
    setVaultState("failed");
    stopCamera();
  };

  const startUnlock = () => {
    if (!userId) return;
    setVaultState("verifying");
    setCurrentLevel(1);
    setErrorMsg("");
    setLevels(INITIAL_LEVELS().map((l, i) => i === 0 ? { ...l, status: "active", detail: "Detecting face…" } : l));
    setFaceDetected(false); setFaceStable(0); setFaceConfidence(0);
    setHandSamples(0); setHandConfidence(0);
    setGestureSeq([]); setCurrentGesture(null); setGestureHold(0);
    setVoiceChallenge(null); setVoiceRecording(false);
    setWaveHeights(Array(30).fill(8)); setVoiceDistance(null);
    faceStableRef.current = 0;
    runLiveFace();
  };

  // ─── Level 1: Face ───────────────────────────────────────────────────────────
  const runLiveFace = async () => {
    updateLevel(0, { status: "active", detail: "Look at the camera…" });
    const ok = await startCamera();
    if (!ok) { failAt(0, "Camera access denied"); return; }

    busyRef.current = false;
    faceStableRef.current = 0;

    intervalRef.current = setInterval(async () => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        const image = captureFrame();
        if (!image) return;
        const frame = await processFaceFrame(image);

        if (frame.success && frame.face_detected && frame.embedding) {
          setFaceDetected(true);
          faceStableRef.current += 1;
          setFaceStable(faceStableRef.current);
          updateLevel(0, { detail: `Face locked · stabilising ${faceStableRef.current}/5…` });

          if (faceStableRef.current >= 5) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
            stopCamera();
            updateLevel(0, { detail: "Verifying face identity…" });
            try {
              const res = await verifyFace(userId, frame.embedding);
              setFaceConfidence(res.confidence ?? 0);
              if (res.verified) {
                updateLevel(0, { status: "pass", detail: `Verified (${((res.confidence ?? 0) * 100).toFixed(1)}% confidence)` });
                await sleep(600);
                setCurrentLevel(2);
                updateLevel(1, { status: "active", detail: "Place hand in front of camera…" });
                runLiveHand();
              } else {
                failAt(0, res.error || res.message || "Face mismatch");
              }
            } catch { failAt(0, "Server error during face verification"); }
          }
        } else {
          setFaceDetected(false);
          faceStableRef.current = 0;
          setFaceStable(0);
          if (frame.error) {
            updateLevel(0, { detail: `Error: ${frame.error}` });
          } else {
            updateLevel(0, { detail: "No face detected. Centre your face." });
          }
        }
      } catch { /* transient error */ }
      finally { busyRef.current = false; }
    }, 250);
  };

  // ─── Level 2: Hand ────────────────────────────────────────────────────────────
  const runLiveHand = async () => {
    updateLevel(1, { status: "active", detail: "Place hand in front of camera…" });
    const ok = await startCamera();
    if (!ok) { failAt(1, "Camera access denied"); return; }

    let count = 0;
    const collected = [];
    intervalRef.current = setInterval(async () => {
      if (!videoRef.current) return;
      const image = captureFrame();
      if (!image) return;
      try {
        const result = await processHandFrame(image);
        if (result.success && result.hand_detected) {
          collected.push(result.landmarks);
          count += 1;
          setHandSamples(count);
          setHandConfidence(Math.min((count / 25) * 0.7, 0.7));
          updateLevel(1, { detail: `Capturing ${count}/25…` });
        }
      } catch { /* ignore */ }

      if (count >= 25) {
        clearInterval(intervalRef.current);
        try {
          const result = await verifyHand(userId, collected);
          setHandConfidence(result.confidence || 0);
          if (result.verified) {
            updateLevel(1, { status: "pass", detail: `Verified (${((result.confidence || 0) * 100).toFixed(1)}%)` });
            stopCamera();
            await sleep(600);
            setCurrentLevel(3);
            updateLevel(2, { status: "active", detail: "Show gesture password…" });
            runLiveGesture();
          } else {
            stopCamera(); failAt(1, result.message || "Hand mismatch");
          }
        } catch { stopCamera(); failAt(1, "Server error during hand verification"); }
      }
    }, 200);
  };

  // ─── Level 3: Gesture ─────────────────────────────────────────────────────────
  const runLiveGesture = async () => {
    updateLevel(2, { status: "active", detail: "Show gestures to camera…" });
    setGestureSeq([]);
    const ok = await startCamera();
    if (!ok) { failAt(2, "Camera access denied"); return; }

    const collected = [];
    let lastGesture = null;
    let stable = 0;

    intervalRef.current = setInterval(async () => {
      if (!videoRef.current || collected.length >= 3) return;
      const image = captureFrame();
      if (!image) return;
      try {
        const result = await detectGesture(image);
        if (result.success && result.hand_detected && result.gesture) {
          setCurrentGesture(result.gesture);
          stable = result.gesture === lastGesture ? stable + 1 : 1;
          setGestureHold(stable);
          if (stable >= 10) {
            collected.push(result.gesture);
            setGestureSeq([...collected]);
            updateLevel(2, { detail: `Captured ${collected.length}/3: ${result.gesture}` });
            stable = 0; setGestureHold(0);
            await sleep(800);
          }
          lastGesture = result.gesture;
        }
      } catch { /* ignore */ }

      if (collected.length >= 3) {
        clearInterval(intervalRef.current);
        stopCamera();
        try {
          const result = await verifyGesture(userId, collected);
          if (result.verified) {
            updateLevel(2, { status: "pass", detail: "Gesture password correct" });
            await sleep(600);
            setCurrentLevel(4);
            updateLevel(3, { status: "active", detail: "Speak the challenge phrase…" });
            runLiveVoice();
          } else {
            failAt(2, result.message || "Wrong gesture sequence");
          }
        } catch { failAt(2, "Server error during gesture verification"); }
      }
    }, 200);
  };

  // ─── Level 4: Voice ───────────────────────────────────────────────────────────
  const runLiveVoice = async () => {
    let challenge;
    try {
      challenge = await getVoiceChallenge();
      setVoiceChallenge(challenge);
    } catch {
      challenge = { challenge: "Say: secure 77", expected: "secure 77" };
      setVoiceChallenge(challenge);
    }
    updateLevel(3, { status: "active", detail: "Speak the challenge phrase…" });
    await sleep(500);

    let waveInterval = null;
    try {
      setVoiceRecording(true);
      waveInterval = setInterval(() => {
        setWaveHeights(Array(30).fill(0).map(() => Math.random() * 50 + 8));
      }, 100);
      const blob = await recordWav(4000);
      clearInterval(waveInterval);
      setVoiceRecording(false);
      updateLevel(3, { detail: "Analysing QNV phase projection + liveness…" });
      const result = await verifyVoice(userId, blob, challenge);
      setVoiceDistance(result.distance);
      if (result.verified) {
        updateLevel(3, { status: "pass", detail: `QNV verified (${((result.confidence || 0) * 100).toFixed(1)}%)` });
        await sleep(500);
        setVaultState("unlocked");
      } else {
        failAt(3, result.message || "Voice mismatch");
      }
    } catch (err) {
      if (waveInterval) clearInterval(waveInterval);
      setVoiceRecording(false);
      failAt(3, err.message || "Microphone access denied");
    }
  };

  const reset = () => {
    stopCamera();
    setVaultState("locked");
    setCurrentLevel(0);
    setErrorMsg("");
    setLevels(INITIAL_LEVELS());
    setFaceDetected(false); setFaceStable(0); setFaceConfidence(0);
    setHandSamples(0); setHandConfidence(0);
    setGestureSeq([]); setCurrentGesture(null); setGestureHold(0);
    setVoiceChallenge(null); setVoiceRecording(false);
    setWaveHeights(Array(30).fill(8)); setVoiceDistance(null);
  };

  const totalLevels = levels.length;

  return (
    <div className="lock-screen animate-fadeIn">
      <div className="vault-header">
        <div className={`vault-icon ${vaultState}`}>
          {vaultState === "unlocked" ? "✅" : vaultState === "failed" ? "❌" : vaultState === "verifying" ? "🔄" : "🔒"}
        </div>
        <h2 className="vault-title">
          {vaultState === "locked"    && "Vault Locked"}
          {vaultState === "verifying" && "Verifying Identity…"}
          {vaultState === "unlocked"  && "Access Granted"}
          {vaultState === "failed"    && "Access Denied"}
        </h2>
        <p className="vault-subtitle">
          {vaultState === "locked"    && "Complete 4-level live biometric authentication to unlock"}
          {vaultState === "verifying" && `Processing Level ${currentLevel} of ${totalLevels}`}
          {vaultState === "unlocked"  && "All 4 levels passed — vault is open"}
          {vaultState === "failed"    && "Authentication failed at one or more levels"}
        </p>
      </div>

      <div className="lock-rings">
        {levels.map((level, index) => (
          <div key={level.key} className={`lock-ring ${level.status}`}>
            <div className="ring-header">
              <div className={`ring-indicator ${level.status}`}>
                {level.status === "pass" ? "✓" : level.status === "fail" ? "✗" : index + 1}
              </div>
              <div className="ring-info">
                <span className="ring-label">{level.icon} {level.label}</span>
                <span className={`ring-status-badge ${level.status}`}>
                  {level.status === "pending" && "Waiting"}
                  {level.status === "active"  && "In Progress"}
                  {level.status === "pass"    && "Passed"}
                  {level.status === "fail"    && "Failed"}
                </span>
              </div>
            </div>
            {level.detail && <p className="ring-detail">{level.detail}</p>}

            {/* ── Face level content ── */}
            {level.key === "face" && level.status === "active" && (
              <div className="ring-content">
                <div className="mini-webcam face-webcam">
                  <video ref={currentLevel === 1 ? videoRef : null} autoPlay playsInline muted />
                  <div className={`face-scan-ring ${faceDetected ? "detected" : ""}`}>
                    <div className="face-scan-corner tl" />
                    <div className="face-scan-corner tr" />
                    <div className="face-scan-corner bl" />
                    <div className="face-scan-corner br" />
                    {faceDetected && <div className="face-scan-line" />}
                  </div>
                </div>
                <div className={`face-status-row ${faceDetected ? "face-detected-row" : ""}`}>
                  <div className={`face-dot-indicator ${faceDetected ? "active" : ""}`} />
                  <span className="face-status-label">
                    {faceDetected ? `Face locked · ${faceStable}/5 stable frames` : "Searching for face…"}
                  </span>
                </div>
                {faceDetected && (
                  <div className="confidence-meter">
                    <div className="label"><span>Stabilising</span><span>{faceStable}/5</span></div>
                    <div className="meter-track">
                      <div className="meter-fill meter-fill-purple" style={{ width: `${(faceStable / 5) * 100}%` }} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Hand level content ── */}
            {level.key === "hand" && level.status === "active" && (
              <div className="ring-content">
                <div className="mini-webcam">
                  <video ref={currentLevel === 2 ? videoRef : null} autoPlay playsInline muted />
                </div>
                <div className="confidence-meter">
                  <div className="label"><span>Samples</span><span>{handSamples}/25</span></div>
                  <div className="meter-track">
                    <div className="meter-fill" style={{ width: `${(handSamples / 25) * 100}%` }} />
                  </div>
                </div>
              </div>
            )}

            {/* ── Gesture level content ── */}
            {level.key === "gesture" && level.status === "active" && (
              <div className="ring-content">
                <div className="mini-webcam">
                  <video ref={currentLevel === 3 ? videoRef : null} autoPlay playsInline muted />
                </div>
                {currentGesture && (
                  <div className="gesture-current">
                    <span className="gesture-current-emoji">{GESTURE_LABELS[currentGesture] || currentGesture}</span>
                    <span className="gesture-current-name">{currentGesture}</span>
                    <div className="gesture-hold-bar">
                      <div className="gesture-hold-fill" style={{ width: `${Math.min(gestureHold / 10, 1) * 100}%` }} />
                    </div>
                  </div>
                )}
                <div className="gesture-sequence">
                  {[0, 1, 2].map((slot) => (
                    <div key={slot} className={`gesture-slot ${gestureSeq[slot] ? "filled" : ""}`}>
                      {gestureSeq[slot] ? (
                        <><span className="gesture-emoji">{GESTURE_LABELS[gestureSeq[slot]]}</span><span>{gestureSeq[slot]}</span></>
                      ) : <span>{slot + 1}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Voice level content ── */}
            {level.key === "voice" && level.status === "active" && (
              <div className="ring-content">
                {voiceChallenge && (
                  <div className="challenge-display">
                    <div className="challenge-label">Challenge</div>
                    <div className="challenge-text">{voiceChallenge.challenge}</div>
                  </div>
                )}
                <div className="waveform-container">
                  {waveHeights.map((height, wi) => (
                    <div
                      key={wi}
                      className={`wave-bar ${voiceRecording ? "active" : ""}`}
                      style={{ height: `${height}px`, animationDelay: `${wi * 0.05}s`, opacity: voiceRecording ? 1 : 0.3 }}
                    />
                  ))}
                </div>
                {voiceDistance !== null && (
                  <div className="confidence-meter">
                    <div className="label"><span>QNV distance</span><span>{voiceDistance}</span></div>
                    <div className="meter-track">
                      <div className="meter-fill" style={{ width: `${Math.max(0, 100 - voiceDistance)}%`, background: voiceDistance < 90 ? "var(--gradient-success)" : "var(--gradient-danger)" }} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {index < totalLevels - 1 && (
              <div className={`ring-connector ${level.status === "pass" ? "completed" : ""}`} />
            )}
          </div>
        ))}
      </div>

      {errorMsg && (
        <div className="error-banner animate-fadeInUp">
          <div className="error-icon">⚠️</div>
          <div className="error-text">{errorMsg}</div>
        </div>
      )}

      {vaultState === "unlocked" && (
        <div className="unlocked-panel animate-fadeInUp">
          <div className="unlocked-icon">🔓</div>
          <h3>Vault Unlocked</h3>
          <p>All 4 biometric levels verified successfully</p>
          <div className="unlocked-data">
            <div className="data-row"><span>Face Confidence</span><span>{(faceConfidence * 100).toFixed(1)}%</span></div>
            <div className="data-row"><span>Hand Confidence</span><span>{(handConfidence * 100).toFixed(1)}%</span></div>
            <div className="data-row"><span>Gesture Sequence</span><span>{gestureSeq.join(" → ")}</span></div>
            <div className="data-row"><span>Voice Distance</span><span>{voiceDistance}</span></div>
          </div>
        </div>
      )}

      {vaultState === "locked" && (
        <div className="glass-card" style={{ marginTop: "1.5rem" }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: "0.9rem", marginBottom: "0.75rem" }}>
            👤 Select User Profile
          </h3>
          {users.length === 0 ? (
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
              No users found. <a href="/admin/users" style={{ color: "var(--accent-purple)" }}>Create one in Admin Panel →</a>
            </p>
          ) : (
            <div className="admin-user-selector">
              {users.map(u => (
                <button key={u.id}
                  className={`admin-user-chip ${userId === u.id ? "active" : ""}`}
                  onClick={() => setUserId(u.id)}>
                  <span>👤</span>
                  {u.display_name || u.username}
                  <span className="chip-count">{u.enrolled_count || 0}/4</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="vault-actions">
        {vaultState === "locked" && (
          <button
            className="btn btn-primary btn-lg unlock-btn"
            onClick={startUnlock}
            disabled={!userId}
            style={{ opacity: userId ? 1 : 0.5 }}
          >
            🔐 Begin Authentication
          </button>
        )}
        {(vaultState === "failed" || vaultState === "unlocked") && (
          <button className="btn btn-ghost btn-lg" onClick={reset}>
            {vaultState === "failed" ? "🔄 Retry" : "🔒 Lock Again"}
          </button>
        )}
      </div>
    </div>
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
