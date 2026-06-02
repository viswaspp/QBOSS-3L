import { useState, useRef, useCallback, useEffect } from "react";
import { detectGesture, verifyGesture } from "../utils/api";

const GESTURE_LABELS = {
  fist: "Fist",
  palm: "Palm",
  peace: "Peace",
  point: "Point",
  three: "Three",
  five: "Five",
  rock: "Rock",
  two: "Two",
  ok: "OK",
};

export default function GestureVerify() {
  const [status, setStatus] = useState("idle");
  const [sequence, setSequence] = useState([]);
  const [currentGesture, setCurrentGesture] = useState(null);
  const [stableCount, setStableCount] = useState(0);
  const [message, setMessage] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const lastGestureRef = useRef(null);
  const stableRef = useRef(0);

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

  const runLive = async () => {
    setStatus("scanning");
    setSequence([]);
    setMessage("Show your gestures to the camera...");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setMessage("Camera access denied");
      setStatus("idle");
      return;
    }

    const collected = [];

    intervalRef.current = setInterval(async () => {
      if (!videoRef.current || collected.length >= 3) return;

      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      canvas.getContext("2d").drawImage(videoRef.current, 0, 0, 640, 480);
      const imageData = canvas.toDataURL("image/jpeg", 0.7);

      try {
        const data = await detectGesture(imageData);
        if (data.success && data.hand_detected && data.gesture) {
          setCurrentGesture(data.gesture);

          if (data.gesture === lastGestureRef.current) {
            stableRef.current += 1;
            setStableCount(stableRef.current);
          } else {
            stableRef.current = 1;
            setStableCount(1);
          }

          if (stableRef.current >= 10) {
            collected.push(data.gesture);
            setSequence([...collected]);
            setMessage(`Captured: ${data.gesture} (${collected.length}/3)`);
            stableRef.current = 0;
            setStableCount(0);
            await new Promise((resolve) => setTimeout(resolve, 800));
          }

          lastGestureRef.current = data.gesture;
        }
      } catch {
        // Ignore transient frame errors.
      }

      if (collected.length >= 3) {
        clearInterval(intervalRef.current);
        stopCamera();

        try {
          const verifyData = await verifyGesture(collected);
          setStatus(verifyData.verified ? "verified" : "denied");
          setMessage(verifyData.message || verifyData.error || "Verification finished");
        } catch {
          setStatus("denied");
          setMessage("Verification failed");
        }
      }
    }, 200);
  };

  const reset = () => {
    stopCamera();
    setStatus("idle");
    setSequence([]);
    setCurrentGesture(null);
    setStableCount(0);
    setMessage("");
    lastGestureRef.current = null;
    stableRef.current = 0;
  };

  return (
    <div className="verify-container animate-fadeInUp">
      <div className="page-header">
        <h2>Level 2 - Gesture Password</h2>
        <p>Perform a sequence of 3 hand gestures as your biometric password</p>
      </div>

      <div className="webcam-container">
        {status === "scanning" ? (
          <video ref={videoRef} autoPlay playsInline muted />
        ) : (
          <div className="webcam-overlay">
            <div className="webcam-placeholder">
              <div className="icon">G</div>
              <p>{status === "idle" ? "Click Start to begin gesture capture" : ""}</p>
            </div>
          </div>
        )}
        {status === "scanning" && <div className="scan-line"></div>}
      </div>

      {currentGesture && status === "scanning" && (
        <div className="glass-card" style={{ textAlign: "center", marginBottom: "1rem" }}>
          <span style={{ fontSize: "2rem" }}>{GESTURE_LABELS[currentGesture] || currentGesture}</span>
          <p style={{ fontFamily: "var(--font-mono)", color: "var(--accent-cyan)", marginTop: "0.25rem" }}>
            Hold {stableCount}/10
          </p>
        </div>
      )}

      <div className="gesture-sequence">
        {[0, 1, 2].map((index) => (
          <div key={index} className={`gesture-slot ${sequence[index] ? "filled" : ""}`}>
            {sequence[index] ? (
              <>
                <span className="gesture-emoji">{GESTURE_LABELS[sequence[index]] || sequence[index]}</span>
                <span>{sequence[index]}</span>
              </>
            ) : (
              <span>Slot {index + 1}</span>
            )}
          </div>
        ))}
      </div>

      {message && (
        <div className="glass-card" style={{ textAlign: "center", marginBottom: "1rem" }}>
          <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>{message}</p>
        </div>
      )}

      {(status === "verified" || status === "denied") && (
        <div className={`result-panel ${status === "verified" ? "success" : "failure"}`}>
          <div className="result-icon">{status === "verified" ? "OK" : "X"}</div>
          <h3>{status === "verified" ? "Gesture Verified" : "Wrong Gesture"}</h3>
          <p>{message}</p>
        </div>
      )}

      <div style={{ display: "flex", gap: "1rem", justifyContent: "center", marginTop: "1.5rem" }}>
        {status === "idle" && (
          <button className="btn btn-primary btn-lg" onClick={runLive}>
            Start Gesture Capture
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
