import { useCallback, useEffect, useRef, useState } from "react";
import {
  detectGesture,
  enrollFace,
  enrollGesture,
  enrollHand,
  enrollVoice,
  getModels,
  listUsers,
  processFaceFrame,
  processHandFrame,
} from "../utils/api";
import { acquireMicStream, recordWavWithStream, releaseMicStream } from "../utils/audio";

const FACE_TARGET = 40;       // embeddings collected during face enrollment
const HAND_TARGET = 60;
const VOICE_SAMPLE_COUNT = 3;
const VOICE_RECORDING_MS = 4000;
const GESTURE_HOLD_FRAMES = 10;

const GESTURE_NAMES = {
  fist: "Fist", palm: "Palm", peace: "Peace", point: "Point",
  three: "Three", five: "Five", rock: "Rock", two: "Two", ok: "OK",
};

export default function Enrollment() {
  const [models, setModels] = useState({
    face_enrolled: false,
    hand_enrolled: false,
    gesture_enrolled: false,
    voice_enrolled: false,
  });
  const [activeEnroll, setActiveEnroll] = useState(null);
  const [enrollStatus, setEnrollStatus] = useState("");
  const [enrollProgress, setEnrollProgress] = useState(0);
  const [handPhase, setHandPhase] = useState("");
  const [gestureSequence, setGestureSequence] = useState([]);
  const [currentGesture, setCurrentGesture] = useState("");
  const [gestureHold, setGestureHold] = useState(0);
  const [voiceSample, setVoiceSample] = useState(0);
  const [waveHeights, setWaveHeights] = useState(Array(30).fill(10));
  const [faceCount, setFaceCount] = useState(0);
  const [faceDetected, setFaceDetected] = useState(false);
  const [faceAnalysis, setFaceAnalysis] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const busyRef = useRef(false);
  const handPositiveRef = useRef([]);
  const handNegativeRef = useRef([]);
  const gestureSequenceRef = useRef([]);
  const lastGestureRef = useRef(null);
  const stableGestureRef = useRef(0);
  const cooldownUntilRef = useRef(0);
  const faceEmbeddingsRef = useRef([]);

  const stopCamera = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const waitForVideoElement = async (timeoutMs = 1500) => {
    const maxAttempts = Math.ceil(timeoutMs / 30);
    for (let attempt = 0; attempt < maxAttempts && !videoRef.current; attempt += 1) {
      await sleep(30);
    }
    return videoRef.current;
  };

  const [userId, setUserId] = useState(null);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    listUsers().then(r => setUsers(r.users || [])).catch(() => { });
    return () => stopCamera();
  }, [stopCamera]);

  useEffect(() => {
    if (userId) getModels(userId).then(setModels).catch(() => { });
  }, [userId]);

  const refreshModels = async () => {
    if (userId) try { const m = await getModels(userId); setModels(m); } catch { return; }
  };

  const finishEnrollment = async (key, message, extra = {}) => {
    stopCamera();
    setEnrollProgress(100);
    setEnrollStatus(message);
    setModels((prev) => ({ ...prev, [`${key}_enrolled`]: true }));
    if (extra.analysis) setFaceAnalysis(extra.analysis);
    await refreshModels();
    setTimeout(() => {
      setActiveEnroll(null);
      setEnrollStatus("");
      setEnrollProgress(0);
      setHandPhase("");
      setGestureSequence([]);
      setCurrentGesture("");
      setGestureHold(0);
      setVoiceSample(0);
      setWaveHeights(Array(30).fill(10));
      setFaceCount(0);
      setFaceDetected(false);
    }, 2500);
  };

  const failEnrollment = (message) => {
    stopCamera();
    setEnrollStatus(message);
    setEnrollProgress(0);
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

  const startEnrollment = async (key) => {
    if (!userId) {
      setEnrollStatus("Select a user profile before enrolling.");
      return;
    }
    stopCamera();
    setActiveEnroll(key);
    setEnrollProgress(0);
    setEnrollStatus("");
    setHandPhase("");
    setGestureSequence([]);
    setCurrentGesture("");
    setGestureHold(0);
    setVoiceSample(0);
    setFaceCount(0);
    setFaceDetected(false);
    setFaceAnalysis(null);

    if (key === "face") await startFaceEnrollment();
    if (key === "hand") await startHandEnrollment();
    if (key === "gesture") await startGestureEnrollment();
    if (key === "voice") await startVoiceEnrollment();
  };

  // ─── Face Enrollment ─────────────────────────────────────────────────────────
  const startFaceEnrollment = async () => {
    faceEmbeddingsRef.current = [];
    setEnrollStatus("Starting camera…");
    const ok = await startCamera();
    if (!ok) { failEnrollment("Camera access denied."); return; }

    setEnrollStatus("Position your face in the frame and hold still.");
    busyRef.current = false;

    intervalRef.current = setInterval(async () => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        const image = captureFrame();
        if (!image) return;

        const result = await processFaceFrame(image);

        if (result.success && result.face_detected && result.embedding) {
          faceEmbeddingsRef.current.push(result.embedding);
          const count = faceEmbeddingsRef.current.length;
          setFaceCount(count);
          setFaceDetected(true);
          setEnrollProgress(Math.round((count / FACE_TARGET) * 100));
          setEnrollStatus(
            `Capturing face: ${count}/${FACE_TARGET} samples — hold steady, vary angle slightly`
          );

          if (count >= FACE_TARGET) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
            setEnrollStatus("Analysing facial biometrics with AI…");
            setEnrollProgress(95);
            const saveResult = await enrollFace(userId, faceEmbeddingsRef.current);
            if (saveResult.success) {
              await finishEnrollment("face", saveResult.message, { analysis: saveResult.analysis });
            } else {
              failEnrollment(saveResult.error || "Face enrollment failed.");
            }
          }
        } else {
          setFaceDetected(false);
          if (result.error) {
            setEnrollStatus(`Error: ${result.error}`);
          } else {
            setEnrollStatus("No face detected. Centre your face in the frame.");
          }
        }
      } catch (err) {
        failEnrollment(err.message || "Face enrollment error.");
      } finally {
        busyRef.current = false;
      }
    }, 220);
  };

  // ─── Hand Enrollment ─────────────────────────────────────────────────────────
  const startHandEnrollment = async () => {
    handPositiveRef.current = [];
    handNegativeRef.current = [];
    setEnrollStatus("Starting camera…");
    const ok = await startCamera();
    if (!ok) { failEnrollment("Camera access denied."); return; }
    captureHandPhase("positive");
  };

  const captureHandPhase = (phase) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setHandPhase(phase);
    setEnrollProgress(0);
    busyRef.current = false;

    intervalRef.current = setInterval(async () => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        const image = captureFrame();
        if (!image) return;
        const result = await processHandFrame(image);
        const bucket = phase === "positive" ? handPositiveRef.current : handNegativeRef.current;
        if (result.success && result.hand_detected) {
          bucket.push(result.landmarks);
          setEnrollProgress(Math.round((bucket.length / HAND_TARGET) * 100));
          setEnrollStatus(`${phase === "positive" ? "Your hand" : "Negative hand"}: ${bucket.length}/${HAND_TARGET}`);
        } else if (result.error) {
          setEnrollStatus(`Error: ${result.error}`);
        } else {
          setEnrollStatus("No hand detected. Keep one hand visible.");
        }
        if (bucket.length >= HAND_TARGET) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          if (phase === "positive") {
            setHandPhase("negative-ready");
            setEnrollProgress(0);
            setEnrollStatus("Positive samples saved. Show a different hand, then continue.");
          } else {
            await trainHandModel();
          }
        }
      } catch (err) {
        failEnrollment(err.message || "Hand enrollment failed.");
      } finally {
        busyRef.current = false;
      }
    }, 180);
  };

  const trainHandModel = async () => {
    setHandPhase("training");
    setEnrollStatus("Training hand biometric model…");
    setEnrollProgress(95);
    const result = await enrollHand(userId, handPositiveRef.current, handNegativeRef.current);
    if (result.success) await finishEnrollment("hand", result.message);
    else failEnrollment(result.error || "Hand enrollment failed.");
  };

  // ─── Gesture Enrollment ───────────────────────────────────────────────────────
  const startGestureEnrollment = async () => {
    gestureSequenceRef.current = [];
    lastGestureRef.current = null;
    stableGestureRef.current = 0;
    cooldownUntilRef.current = 0;
    setGestureSequence([]);
    setCurrentGesture("");
    setGestureHold(0);
    setEnrollStatus("Starting camera…");
    const ok = await startCamera();
    if (!ok) { failEnrollment("Camera access denied."); return; }

    intervalRef.current = setInterval(async () => {
      if (busyRef.current || Date.now() < cooldownUntilRef.current) return;
      busyRef.current = true;
      try {
        const image = captureFrame();
        if (!image) return;
        const result = await detectGesture(image);
        if (result.success && result.hand_detected && result.gesture) {
          setCurrentGesture(result.gesture);
          if (result.gesture === lastGestureRef.current) stableGestureRef.current += 1;
          else stableGestureRef.current = 1;
          setGestureHold(stableGestureRef.current);
          setEnrollStatus(`Hold ${GESTURE_NAMES[result.gesture] || result.gesture}: ${stableGestureRef.current}/${GESTURE_HOLD_FRAMES}`);
          if (stableGestureRef.current >= GESTURE_HOLD_FRAMES) {
            gestureSequenceRef.current = [...gestureSequenceRef.current, result.gesture];
            setGestureSequence(gestureSequenceRef.current);
            setEnrollProgress(Math.round((gestureSequenceRef.current.length / 3) * 100));
            setEnrollStatus(`Captured ${gestureSequenceRef.current.length}/3 gestures.`);
            cooldownUntilRef.current = Date.now() + 900;
            lastGestureRef.current = null;
            stableGestureRef.current = 0;
            setGestureHold(0);
            if (gestureSequenceRef.current.length >= 3) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
              stopCamera();
              const saveResult = await enrollGesture(userId, gestureSequenceRef.current);
              if (saveResult.success) await finishEnrollment("gesture", saveResult.message);
              else failEnrollment(saveResult.error || "Gesture enrollment failed.");
            }
          } else {
            lastGestureRef.current = result.gesture;
          }
        } else {
          setEnrollStatus("No gesture detected. Keep your hand centred.");
        }
      } catch (err) {
        failEnrollment(err.message || "Gesture enrollment failed.");
      } finally {
        busyRef.current = false;
      }
    }, 200);
  };

  // ─── Voice Enrollment ─────────────────────────────────────────────────────────
  const startVoiceEnrollment = async () => {
    const samples = [];
    let waveInterval = null;
    let micStream = null;
    try {
      setEnrollStatus("Requesting microphone…");
      micStream = await acquireMicStream();

      for (let i = 1; i <= VOICE_SAMPLE_COUNT; i += 1) {
        setVoiceSample(i);
        setEnrollStatus(`Recording voice sample ${i}/${VOICE_SAMPLE_COUNT}. Speak naturally.`);
        waveInterval = setInterval(() => {
          setWaveHeights(Array(30).fill(0).map(() => Math.random() * 55 + 5));
        }, 100);
        const blob = await recordWavWithStream(micStream, VOICE_RECORDING_MS, (progress) => {
          setEnrollProgress(Math.round(((i - 1 + progress) / VOICE_SAMPLE_COUNT) * 100));
        });
        clearInterval(waveInterval);
        waveInterval = null;
        setWaveHeights(Array(30).fill(10));
        // Brief feedback during WAV encoding (runs synchronously)
        setEnrollStatus(`Converting sample ${i}/${VOICE_SAMPLE_COUNT}…`);
        samples.push(blob);
        await sleep(100); // yield so the status text repaints
        setEnrollStatus(`Saved voice sample ${i}/${VOICE_SAMPLE_COUNT}.`);
        if (i < VOICE_SAMPLE_COUNT) await sleep(700);
      }

      releaseMicStream(micStream);
      micStream = null;

      setEnrollStatus("Creating Quantum Noise Voice profile…");
      const result = await enrollVoice(userId, samples);
      if (result.success) await finishEnrollment("voice", result.message);
      else failEnrollment(result.error || "Voice enrollment failed.");
    } catch (err) {
      if (waveInterval) clearInterval(waveInterval);
      if (micStream) releaseMicStream(micStream);
      setWaveHeights(Array(30).fill(10));
      failEnrollment(err.message || "Microphone access denied.");
    }
  };

  const cancelEnrollment = () => {
    stopCamera();
    setActiveEnroll(null);
    setEnrollStatus("");
    setEnrollProgress(0);
    setHandPhase("");
    setGestureSequence([]);
    setCurrentGesture("");
    setGestureHold(0);
    setVoiceSample(0);
    setWaveHeights(Array(30).fill(10));
    setFaceCount(0);
    setFaceDetected(false);
  };

  const enrollItems = [
    {
      key: "face",
      icon: "👤",
      title: "Face Recognition Enrollment",
      desc: "AI captures 40 facial embeddings (128-D OpenCV descriptors) and analyses consistency, spread, and quality.",
      enrolled: models.face_enrolled,
      color: "purple",
    },
    {
      key: "hand",
      icon: "✋",
      title: "Hand Biometric Enrollment",
      desc: "Capture your hand and a negative hand sample set to train the SVM verifier.",
      enrolled: models.hand_enrolled,
      color: "cyan",
    },
    {
      key: "gesture",
      icon: "🤙",
      title: "Gesture Password Setup",
      desc: "Capture a stable sequence of 3 gestures as your gesture password.",
      enrolled: models.gesture_enrolled,
      color: "pink",
    },
    {
      key: "voice",
      icon: "🎙️",
      title: "Voice Print Enrollment",
      desc: "Record 3 voice samples to create a QNV profile with acoustic, stochastic projection, and quality models.",
      enrolled: models.voice_enrolled,
      color: "green",
    },
  ];

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <h2>Biometric Enrollment</h2>
        <p>Select your user profile, then register each authentication level</p>
      </div>

      <div className="glass-card" style={{ marginBottom: "1.5rem" }}>
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

      {!userId && (
        <div className="glass-card" style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-muted)" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>👆</div>
          <p>Select a user profile above to begin enrollment</p>
        </div>
      )}

      {userId && (
        <div className="enroll-grid stagger">
          {enrollItems.map((item) => {
            const isActive = activeEnroll === item.key;
            return (
              <div key={item.key} className={`enroll-card enroll-${item.color}`}>
                <div className="enroll-card-header">
                  <div className={`enroll-icon enroll-icon-${item.color}`}>{item.icon}</div>
                  <div>
                    <h3>{item.title}</h3>
                    <span className={`status-badge ${item.enrolled ? "enrolled" : "not-enrolled"}`}>
                      <span className="status-dot" />
                      {item.enrolled ? "Enrolled" : "Not Enrolled"}
                    </span>
                  </div>
                </div>
                <p className="enroll-desc">{item.desc}</p>

                {isActive ? (
                  <div className="enroll-progress-area">
                    {/* Camera preview — shown for face, hand, gesture */}
                    {item.key !== "voice" && (
                      <div className={`mini-webcam ${item.key === "face" ? "face-webcam" : ""}`}>
                        <video ref={videoRef} autoPlay playsInline muted />
                        {item.key === "face" && (
                          <div className={`face-scan-ring ${faceDetected ? "detected" : ""}`}>
                            <div className="face-scan-corner tl" />
                            <div className="face-scan-corner tr" />
                            <div className="face-scan-corner bl" />
                            <div className="face-scan-corner br" />
                            {faceDetected && <div className="face-scan-line" />}
                          </div>
                        )}
                        {item.key !== "face" && <div className="scan-line" />}
                      </div>
                    )}

                    {/* Face-specific status */}
                    {item.key === "face" && (
                      <div className="face-status-row">
                        <div className={`face-dot-indicator ${faceDetected ? "active" : ""}`} />
                        <span className="face-status-label">
                          {faceDetected ? `Face locked · ${faceCount}/${FACE_TARGET} embeddings` : "Searching for face…"}
                        </span>
                      </div>
                    )}

                    {/* Gesture sequence slots */}
                    {item.key === "gesture" && (
                      <div className="gesture-sequence">
                        {[0, 1, 2].map((i) => (
                          <div key={i} className={`gesture-slot ${gestureSequence[i] ? "filled" : ""}`}>
                            {gestureSequence[i] ? GESTURE_NAMES[gestureSequence[i]] || gestureSequence[i] : i + 1}
                          </div>
                        ))}
                      </div>
                    )}
                    {item.key === "gesture" && currentGesture && (
                      <p className="enroll-desc">
                        Current: {GESTURE_NAMES[currentGesture] || currentGesture} ({gestureHold}/{GESTURE_HOLD_FRAMES})
                      </p>
                    )}

                    {/* Voice waveform */}
                    {item.key === "voice" && (
                      <>
                        <div className="waveform-container">
                          {waveHeights.map((h, i) => (
                            <div
                              key={i}
                              className={`wave-bar ${voiceSample ? "active" : ""}`}
                              style={{ height: `${h}px`, opacity: voiceSample ? 1 : 0.3 }}
                            />
                          ))}
                        </div>
                        <p className="enroll-desc">Sample {voiceSample || 1}/{VOICE_SAMPLE_COUNT}</p>
                      </>
                    )}

                    {/* Progress meter */}
                    <div className="confidence-meter">
                      <div className="label">
                        <span>{enrollStatus}</span>
                        <span>{enrollProgress}%</span>
                      </div>
                      <div className="meter-track">
                        <div
                          className={`meter-fill ${item.key === "face" ? "meter-fill-purple" : ""}`}
                          style={{ width: `${enrollProgress}%` }}
                        />
                      </div>
                    </div>

                    {/* Hand negative capture trigger */}
                    {item.key === "hand" && handPhase === "negative-ready" && (
                      <button className="btn btn-primary" onClick={() => captureHandPhase("negative")} style={{ width: "100%" }}>
                        Capture Negative Samples
                      </button>
                    )}

                    <button className="btn btn-ghost" onClick={cancelEnrollment} style={{ marginTop: "0.75rem", width: "100%" }}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Show AI analysis card after face enrollment */}
                    {item.key === "face" && item.enrolled && faceAnalysis && (
                      <div className="face-analysis-card">
                        <div className="face-analysis-title">
                          <span className="face-ai-badge">AI Analysis</span>
                          <span className={`face-quality-badge quality-${faceAnalysis.quality_rating?.toLowerCase()}`}>
                            {faceAnalysis.quality_rating}
                          </span>
                        </div>
                        <div className="face-analysis-grid">
                          <div className="face-stat">
                            <span className="face-stat-label">Samples</span>
                            <span className="face-stat-value">{faceAnalysis.sample_count}</span>
                          </div>
                          <div className="face-stat">
                            <span className="face-stat-label">Similarity</span>
                            <span className="face-stat-value">{(faceAnalysis.mean_intra_similarity * 100).toFixed(1)}%</span>
                          </div>
                          <div className="face-stat">
                            <span className="face-stat-label">Spread σ</span>
                            <span className="face-stat-value">{faceAnalysis.embedding_spread}</span>
                          </div>
                          <div className="face-stat">
                            <span className="face-stat-label">Dimensions</span>
                            <span className="face-stat-value">{faceAnalysis.dimensions}D</span>
                          </div>
                        </div>
                      </div>
                    )}

                    <button
                      className={`btn ${item.enrolled ? "btn-ghost" : "btn-primary"}`}
                      onClick={() => startEnrollment(item.key)}
                      disabled={activeEnroll !== null}
                      style={{ marginTop: "1rem", width: "100%" }}
                    >
                      {item.enrolled ? "Re-Enroll" : "Start Enrollment"}
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="glass-card" style={{ marginTop: "2rem" }}>
        <h3 style={{ fontFamily: "var(--font-display)", marginBottom: "0.75rem", fontSize: "1rem" }}>
          Enrollment Guide
        </h3>
        <div className="guide-steps">
          <div className="guide-step"><span className="guide-num">1</span><div><strong>Face Recognition</strong><p>Look directly at the camera. AI extracts 40 unique 128-D OpenCV face descriptors, analyses quality, and stores the mean template.</p></div></div>
          <div className="guide-step"><span className="guide-num">2</span><div><strong>Hand Biometric</strong><p>Show your hand then a different hand for negative samples. Keep hand centred and steady.</p></div></div>
          <div className="guide-step"><span className="guide-num">3</span><div><strong>Gesture Password</strong><p>Perform 3 distinct gestures and hold each until captured. The exact sequence becomes your password.</p></div></div>
          <div className="guide-step"><span className="guide-num">4</span><div><strong>Quantum Noise Voice</strong><p>Record 3 voice samples. The backend builds a protected QNV profile from acoustic dynamics, pitch stability, liveness quality, and stochastic projections.</p></div></div>
        </div>
      </div>
    </div>
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
