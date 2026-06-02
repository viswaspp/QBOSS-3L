from typing import List
import numpy as np
from db.biometric_store import get_meta, is_enrolled, log_verification
from face.face_enroll import FEATURE_VERSION, extract_face_embedding, load_face_embedding, normalize_face_embedding

COSINE_THRESHOLD    = 0.32
EUCLIDEAN_THRESHOLD = 0.85


def _cosine_dist(a, b):
    return float(1.0 - np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))


def _euclidean_dist(a, b):
    return float(np.linalg.norm(a - b))


def verify_face_embedding(user_id: int, embedding: List[float]) -> dict:
    if not is_enrolled(user_id, "face"):
        return {"success": False, "verified": False, "error": "Face not enrolled for this user.", "confidence": 0.0}

    meta = get_meta(user_id, "face")
    if meta.get("feature_version") != FEATURE_VERSION:
        return {"success": False, "verified": False,
                "error": "Stored face template uses an older face engine. Please re-enroll face.",
                "confidence": 0.0}

    enrolled = load_face_embedding(user_id)
    if enrolled is None:
        return {"success": False, "verified": False, "error": "Stored face template is missing or invalid. Please re-enroll face.", "confidence": 0.0}

    live, error = normalize_face_embedding(embedding)
    if error:
        return {"success": False, "verified": False, "error": error, "confidence": 0.0}

    cos_dist = _cosine_dist(enrolled, live)
    euc_dist = _euclidean_dist(enrolled, live)
    verified = cos_dist <= COSINE_THRESHOLD and euc_dist <= EUCLIDEAN_THRESHOLD
    confidence = max(0.0, min(1.0, 1.0 - (cos_dist / COSINE_THRESHOLD)))

    log_verification(user_id, "face", verified, f"cos={cos_dist:.4f} euc={euc_dist:.4f}")

    return {
        "success": True,
        "verified": verified,
        "cosine_distance": round(cos_dist, 4),
        "euclidean_distance": round(euc_dist, 4),
        "confidence": round(confidence, 4),
        "message": "Face verified!" if verified else "Face mismatch",
        "error": None,
    }


def process_face_frame(b64_image: str) -> dict:
    return extract_face_embedding(b64_image)


def verify_face_from_frame(user_id: int, b64_image: str) -> dict:
    extract = extract_face_embedding(b64_image)
    if not extract["success"] or not extract["face_detected"]:
        return {**extract, "verified": False, "confidence": 0.0}
    return {**verify_face_embedding(user_id, extract["embedding"]), "face_detected": True}
