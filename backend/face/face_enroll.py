import base64
import sys
from typing import List, Optional

import numpy as np

from db.biometric_store import get_meta, is_enrolled, load_biometric, save_biometric

MODALITY = "face"
EMBEDDING_DIM = 128
FEATURE_VERSION = "opencv-dct-lbp-v1"

try:
    import cv2
    _cv_available = True
    _cv_error = None
except Exception as e:
    cv2 = None
    _cv_available = False
    _cv_error = str(e)
    print(f"[WARN] OpenCV unavailable: {_cv_error}", file=sys.stderr)

_face_cascade = None
_face_cascade_error = None


def _get_face_cascade():
    global _face_cascade, _face_cascade_error
    if not _cv_available:
        return None, _cv_error
    if _face_cascade is not None:
        return _face_cascade, None
    try:
        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        cascade = cv2.CascadeClassifier(cascade_path)
        if cascade.empty():
            raise RuntimeError(f"Failed to load Haar cascade: {cascade_path}")
        _face_cascade = cascade
        return _face_cascade, None
    except Exception as e:
        _face_cascade_error = str(e)
        return None, _face_cascade_error


def _decode_image(b64_data: str) -> Optional[np.ndarray]:
    try:
        if not _cv_available:
            return None
        if "," in b64_data:
            b64_data = b64_data.split(",", 1)[1]
        raw = base64.b64decode(b64_data)
        buf = np.frombuffer(raw, dtype=np.uint8)
        bgr = cv2.imdecode(buf, cv2.IMREAD_COLOR)
        return bgr
    except Exception:
        return None


def normalize_face_embedding(value) -> tuple[Optional[np.ndarray], Optional[str]]:
    try:
        arr = np.asarray(value, dtype=np.float64)
    except (TypeError, ValueError):
        return None, "Face embedding must be a numeric array."

    if arr.ndim != 1 or arr.shape[0] != EMBEDDING_DIM:
        return None, f"Face embedding must contain exactly {EMBEDDING_DIM} values."
    if not np.all(np.isfinite(arr)):
        return None, "Face embedding contains invalid numeric values."
    return arr, None


def _largest_face(faces) -> Optional[tuple[int, int, int, int]]:
    if faces is None or len(faces) == 0:
        return None
    return max((tuple(map(int, face)) for face in faces), key=lambda face: face[2] * face[3])


def _crop_with_margin(gray: np.ndarray, face: tuple[int, int, int, int], margin_ratio: float = 0.18) -> tuple[np.ndarray, dict]:
    x, y, w, h = face
    margin_x = int(w * margin_ratio)
    margin_y = int(h * margin_ratio)
    left = max(0, x - margin_x)
    top = max(0, y - margin_y)
    right = min(gray.shape[1], x + w + margin_x)
    bottom = min(gray.shape[0], y + h + margin_y)
    return gray[top:bottom, left:right], {"top": top, "right": right, "bottom": bottom, "left": left}


def _lbp_histogram(img: np.ndarray) -> np.ndarray:
    center = img[1:-1, 1:-1]
    neighbors = [
        img[:-2, :-2], img[:-2, 1:-1], img[:-2, 2:],
        img[1:-1, 2:], img[2:, 2:], img[2:, 1:-1],
        img[2:, :-2], img[1:-1, :-2],
    ]
    lbp = np.zeros_like(center, dtype=np.uint8)
    for bit, neighbor in enumerate(neighbors):
        lbp |= ((neighbor >= center).astype(np.uint8) << (7 - bit))

    h, w = lbp.shape
    features = []
    for row in range(2):
        for col in range(2):
            region = lbp[row * h // 2:(row + 1) * h // 2, col * w // 2:(col + 1) * w // 2]
            hist, _ = np.histogram(region, bins=16, range=(0, 256), density=True)
            features.extend(hist.astype(np.float64))
    return np.array(features, dtype=np.float64)


def _opencv_face_embedding(face_gray: np.ndarray) -> np.ndarray:
    face = cv2.resize(face_gray, (64, 64), interpolation=cv2.INTER_AREA)
    face = cv2.equalizeHist(face)
    face_float = face.astype(np.float32) / 255.0

    dct = cv2.dct(face_float)
    dct_features = dct[:9, :8].flatten()[1:65].astype(np.float64)
    lbp_features = _lbp_histogram(face)
    features = np.concatenate([dct_features, lbp_features])
    features -= features.mean()
    norm = np.linalg.norm(features)
    return (features / (norm + 1e-9)).astype(np.float64)


def extract_face_embedding(b64_image: str) -> dict:
    if not _cv_available:
        return {"success": False, "face_detected": False, "face_count": 0, "embedding": None, "location": None,
                "error": f"OpenCV not available: {_cv_error}. Run: pip install -r backend/requirements.txt"}

    img = _decode_image(b64_image)
    if img is None:
        return {"success": False, "face_detected": False, "face_count": 0, "embedding": None, "location": None, "error": "Failed to decode image"}

    cascade, cascade_error = _get_face_cascade()
    if cascade is None:
        return {"success": False, "face_detected": False, "face_count": 0, "embedding": None, "location": None,
                "error": f"Face detector unavailable: {cascade_error}"}

    try:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        gray = cv2.equalizeHist(gray)
        faces = cascade.detectMultiScale(gray, scaleFactor=1.08, minNeighbors=5, minSize=(72, 72))
    except Exception as e:
        return {"success": False, "face_detected": False, "face_count": 0, "embedding": None, "location": None,
                "error": f"Face detection failed: {e}"}

    selected_face = _largest_face(faces)
    if selected_face is None:
        return {"success": True, "face_detected": False, "face_count": 0, "embedding": None, "location": None, "error": None}

    try:
        crop, location = _crop_with_margin(gray, selected_face)
        embedding = _opencv_face_embedding(crop)
    except Exception as e:
        return {"success": False, "face_detected": True, "face_count": int(len(faces)), "embedding": None, "location": None,
                "error": f"Face encoding failed: {e}"}

    return {
        "success": True,
        "face_detected": True,
        "face_count": int(len(faces)),
        "embedding": embedding.tolist(),
        "location": location,
        "error": None,
    }


def _analyze(arr: np.ndarray) -> dict:
    std_vec  = arr.std(axis=0)
    norms    = np.linalg.norm(arr, axis=1, keepdims=True)
    normed   = arr / (norms + 1e-9)
    sim_mat  = normed @ normed.T
    np.fill_diagonal(sim_mat, np.nan)
    mean_sim = float(np.nanmean(sim_mat))
    spread   = float(np.mean(std_vec))

    if mean_sim >= 0.90 and spread <= 0.06:
        quality = "Excellent"
    elif mean_sim >= 0.82 and spread <= 0.10:
        quality = "Good"
    elif mean_sim >= 0.70:
        quality = "Fair"
    else:
        quality = "Poor"

    return {
        "sample_count": int(arr.shape[0]),
        "mean_intra_similarity": round(mean_sim, 4),
        "embedding_spread": round(spread, 4),
        "quality_rating": quality,
        "dimensions": EMBEDDING_DIM,
        "feature_version": FEATURE_VERSION,
    }


def enroll_face(user_id: int, embeddings: List[List[float]]) -> dict:
    if not embeddings or len(embeddings) < 5:
        return {"success": False, "error": f"Need at least 5 face samples, got {len(embeddings)}.", "analysis": {}}

    try:
        arr = np.asarray(embeddings, dtype=np.float64)
    except (TypeError, ValueError):
        return {"success": False, "error": "Face samples must be numeric embeddings.", "analysis": {}}

    if arr.ndim != 2 or arr.shape[1] != EMBEDDING_DIM:
        return {"success": False, "error": f"Each face sample must contain exactly {EMBEDDING_DIM} values.", "analysis": {}}
    if not np.all(np.isfinite(arr)):
        return {"success": False, "error": "Face samples contain invalid numeric values.", "analysis": {}}

    mean_embedding = arr.mean(axis=0)
    analysis = _analyze(arr)
    save_biometric(user_id, MODALITY, mean_embedding.tobytes(), meta=analysis)
    return {"success": True, "message": f"Face enrolled for user {user_id}.", "analysis": analysis}


def load_face_embedding(user_id: int) -> Optional[np.ndarray]:
    data = load_biometric(user_id, MODALITY)
    if data is None:
        return None
    arr = np.frombuffer(data, dtype=np.float64).copy()
    if arr.shape != (EMBEDDING_DIM,) or not np.all(np.isfinite(arr)):
        return None
    return arr


def check_face_enrolled(user_id: int) -> bool:
    return is_enrolled(user_id, MODALITY)


def get_face_meta(user_id: int) -> dict:
    return get_meta(user_id, MODALITY)
