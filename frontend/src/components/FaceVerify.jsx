import { useCallback, useEffect, useRef, useState } from "react";
import { processFaceFrame, verifyFace } from "../utils/api";

const STABLE_FRAMES = 4;   // consecutive detections before triggering verify
const MAX_ATTEMPTS  = 3;

/**
 * FaceVerify — live-webcam face authentication component.
 *
 * Props:
 *   onResult(result: { verified, confidence, cosine_distance, euclidean_distance })
 *   onCancel()
 */
export default function FaceVerify({ userId, onResult, onCancel }) {
  const [phase, setPhase]           = useState("idle"); // idle | scanning | verifying | done
  const [status, setStatus]         = useState("Click Start to begin face authentication.");
  const [faceDetected, setFaceDetected] = useState(false);
  const [confidence, setConfidence] = useState(0);
  const [attempts, setAttempts]     = useState(0);
  const [result, setResult]         = useState(null);

  const videoRef    = useRef(null);
  const streamRef   = useRef(null);
  const intervalRef = useRef(null);
  const busyRef     = useRef(false);
  const stableRef   = useRef(0);
  const lastEmbRef  = useRef(null);

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

  const startScan = async () => {
    if (!userId) {
      setStatus("Select a user profile before face authentication.");
      setPhase("idle");
      return;
    }

    setPhase("scanning");
    setStatus("Starting camera…");
    stableRef.current = 0;
    lastEmbRef.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      const video = await waitForVideoElement();
      if (!video) {
        stopCamera();
        setStatus("Camera preview was not ready. Try again.");
        setPhase("idle");
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => {});
    } catch {
      setStatus("Camera access denied.");
      setPhase("idle");
      return;
    }

    setStatus("Look directly at the camera…");

    intervalRef.current = setInterval(async () => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        const image = captureFrame();
        if (!image) return;

        const frame = await processFaceFrame(image);

        if (frame.success && frame.face_detected && frame.embedding) {
          setFaceDetected(true);
          lastEmbRef.current = frame.embedding;
          stableRef.current += 1;
          setStatus(`Face locked · stabilising ${stableRef.current}/${STABLE_FRAMES}…`);

          if (stableRef.current >= STABLE_FRAMES) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
            await runVerify(frame.embedding);
          }
        } else {
          setFaceDetected(false);
          stableRef.current = 0;
          setStatus("No face detected. Centre your face in frame.");
        }
      } catch {
        setStatus("Frame processing error.");
      } finally {
        busyRef.current = false;
      }
    }, 250);
  };

  const runVerify = async (embedding) => {
    setPhase("verifying");
    setFaceDetected(false);
    stopCamera();
    setStatus("Analysing facial biometrics…");

    try {
      const res = await verifyFace(userId, embedding);
      setResult(res);
      setPhase("done");

      if (res.verified) {
        setConfidence(res.confidence ?? 0);
        setStatus("Face verified!");
        onResult?.(res);
      } else {
        const failureMessage = res.error || res.message || "Face mismatch";
        const next = attempts + 1;
        setAttempts(next);
        if (next >= MAX_ATTEMPTS) {
          setStatus(`${failureMessage}. ${MAX_ATTEMPTS} attempts exhausted.`);
          onResult?.(res);
        } else {
          setStatus(`${failureMessage} - attempt ${next}/${MAX_ATTEMPTS}. Try again.`);
        }
      }
    } catch {
      setStatus("Verification error. Try again.");
      setPhase("idle");
    }
  };

  const retry = () => {
    setPhase("idle");
    setResult(null);
    setFaceDetected(false);
    setConfidence(0);
    setStatus("Click Start to begin face authentication.");
    stableRef.current = 0;
  };

  return (
    <div className="face-verify-wrap">
      {/* Webcam */}
      <div className={`face-verify-cam ${faceDetected ? "face-detected" : ""}`}>
        <video ref={videoRef} autoPlay playsInline muted />

        {/* Corner brackets */}
        <div className={`face-scan-ring ${faceDetected ? "detected" : ""}`}>
          <div className="face-scan-corner tl" />
          <div className="face-scan-corner tr" />
          <div className="face-scan-corner bl" />
          <div className="face-scan-corner br" />
          {faceDetected && phase === "scanning" && <div className="face-scan-line" />}
        </div>

        {/* Phase overlay */}
        {phase === "idle" && (
          <div className="face-cam-overlay">
            <div className="face-cam-icon">👤</div>
            <p>Camera off</p>
          </div>
        )}
        {phase === "verifying" && (
          <div className="face-cam-overlay">
            <div className="face-verify-spinner" />
            <p>Analysing…</p>
          </div>
        )}
      </div>

      {/* Status row */}
      <div className={`face-status-row ${faceDetected ? "face-detected-row" : ""}`}>
        <div className={`face-dot-indicator ${faceDetected ? "active" : ""}`} />
        <span className="face-status-label">{status}</span>
      </div>

      {/* Result */}
      {phase === "done" && result && (
        <div className={`face-result-panel ${result.verified ? "success" : "fail"}`}>
          <div className="face-result-icon">{result.verified ? "✅" : "❌"}</div>
          <div className="face-result-info">
            <strong>{result.verified ? "Identity Confirmed" : "Identity Rejected"}</strong>
            <div className="face-result-stats">
              {result.confidence != null && (
                <span>Confidence: <b>{(result.confidence * 100).toFixed(1)}%</b></span>
              )}
              {result.cosine_distance != null && (
                <span>Cosine dist: <b>{result.cosine_distance}</b></span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confidence bar — shown when verified */}
      {phase === "done" && result?.verified && (
        <div className="confidence-meter" style={{ marginTop: "0.5rem" }}>
          <div className="label">
            <span>Match confidence</span>
            <span>{(confidence * 100).toFixed(1)}%</span>
          </div>
          <div className="meter-track">
            <div className="meter-fill meter-fill-purple" style={{ width: `${confidence * 100}%` }} />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="face-verify-actions">
        {phase === "idle" && (
          <button className="btn btn-primary" onClick={startScan} style={{ flex: 1 }}>
            Start Face Scan
          </button>
        )}
        {phase === "scanning" && (
          <button className="btn btn-ghost" onClick={() => { stopCamera(); setPhase("idle"); setStatus("Cancelled."); }} style={{ flex: 1 }}>
            Cancel Scan
          </button>
        )}
        {phase === "done" && !result?.verified && attempts < MAX_ATTEMPTS && (
          <button className="btn btn-primary" onClick={retry} style={{ flex: 1 }}>
            Retry
          </button>
        )}
        {onCancel && (
          <button className="btn btn-ghost" onClick={() => { stopCamera(); onCancel(); }}>
            Back
          </button>
        )}
      </div>
    </div>
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
