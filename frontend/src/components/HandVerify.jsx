import { useState, useRef, useCallback, useEffect } from "react";
import { processHandFrame, verifyHand } from "../utils/api";

export default function HandVerify() {
  const [status, setStatus] = useState("idle");
  const [confidence, setConfidence] = useState(0);
  const [samples, setSamples] = useState(0);
  const [message, setMessage] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      return true;
    } catch {
      setMessage("Camera access denied");
      setStatus("idle");
      return false;
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const runLiveScan = async () => {
    setStatus("scanning");
    setSamples(0);
    setConfidence(0);
    setMessage("Place your hand in front of the camera...");
    const cameraReady = await startCamera();
    if (!cameraReady) return;

    let count = 0;
    const collectedSamples = [];

    intervalRef.current = setInterval(async () => {
      if (!videoRef.current) return;
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      canvas.getContext("2d").drawImage(videoRef.current, 0, 0, 640, 480);
      const imageData = canvas.toDataURL("image/jpeg", 0.7);

      try {
        const data = await processHandFrame(imageData);
        if (data.success && data.hand_detected) {
          collectedSamples.push(data.landmarks);
          count += 1;
          setSamples(count);
          setConfidence(Math.min((count / 25) * 0.7, 0.7));
          setMessage(`Capturing sample ${count}/25...`);
        }
      } catch {
        // Ignore transient frame errors.
      }

      if (count >= 25) {
        clearInterval(intervalRef.current);
        try {
          const result = await verifyHand(collectedSamples);
          setConfidence(result.confidence || 0);
          setStatus(result.verified ? "verified" : "denied");
          setMessage(result.message || result.error || "Verification finished");
        } catch {
          setStatus("denied");
          setMessage("Verification failed - server error");
        }
        stopCamera();
      }
    }, 200);
  };

  const reset = () => {
    stopCamera();
    setStatus("idle");
    setConfidence(0);
    setSamples(0);
    setMessage("");
  };

  return (
    <div className="verify-container animate-fadeInUp">
      <div className="page-header">
        <h2>Level 1 - Hand Biometric</h2>
        <p>SVM-based hand geometry verification using MediaPipe</p>
      </div>

      <div className="webcam-container">
        {status === "scanning" ? (
          <video ref={videoRef} autoPlay playsInline muted />
        ) : (
          <div className="webcam-overlay">
            <div className="webcam-placeholder">
              <div className="icon">H</div>
              <p>{status === "idle" ? "Click Start to begin hand scan" : ""}</p>
            </div>
          </div>
        )}
        {status === "scanning" && <div className="scan-line"></div>}
      </div>

      <div className="glass-card" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Samples Collected</span>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--accent-cyan)", fontWeight: 700 }}>{samples}/25</span>
        </div>
        <div className="confidence-meter">
          <div className="label">
            <span>Confidence</span>
            <span>{(confidence * 100).toFixed(1)}%</span>
          </div>
          <div className="meter-track">
            <div className="meter-fill" style={{ width: `${confidence * 100}%` }}></div>
          </div>
        </div>
      </div>

      {message && (
        <div className="glass-card" style={{ textAlign: "center", marginBottom: "1rem" }}>
          <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>{message}</p>
        </div>
      )}

      {(status === "verified" || status === "denied") && (
        <div className={`result-panel ${status === "verified" ? "success" : "failure"}`}>
          <div className="result-icon">{status === "verified" ? "OK" : "X"}</div>
          <h3>{status === "verified" ? "Hand Verified" : "Access Denied"}</h3>
          <p>Confidence: {(confidence * 100).toFixed(1)}%</p>
        </div>
      )}

      <div style={{ display: "flex", gap: "1rem", justifyContent: "center", marginTop: "1.5rem" }}>
        {status === "idle" && (
          <button className="btn btn-primary btn-lg" onClick={runLiveScan}>
            Start Hand Scan
          </button>
        )}
        {(status === "verified" || status === "denied") && (
          <button className="btn btn-ghost btn-lg" onClick={reset}>
            Scan Again
          </button>
        )}
      </div>
    </div>
  );
}
