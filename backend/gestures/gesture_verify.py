import json
from db.biometric_store import is_enrolled, load_biometric, log_verification

MODALITY = "gesture"


def _load_sequence(user_id: int):
    data = load_biometric(user_id, MODALITY)
    return json.loads(data.decode()) if data else None


def verify_gesture_sequence(user_id: int, detected):
    if not is_enrolled(user_id, MODALITY):
        return {"success": False, "error": "Gesture not enrolled for this user."}
    try:
        stored = _load_sequence(user_id)
        if stored is None:
            return {"success": False, "error": "Could not load gesture template."}
        if len(detected) != len(stored):
            return {"success": True, "verified": False, "message": f"Expected {len(stored)} gestures, got {len(detected)}", "expected_count": len(stored)}
        matched = detected == stored
        log_verification(user_id, MODALITY, matched, f"detected={detected}")
        return {"success": True, "verified": matched, "detected": detected, "expected_count": len(stored),
                "message": "Gesture verified!" if matched else "Wrong gesture sequence"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_gesture_count(user_id: int) -> int:
    seq = _load_sequence(user_id)
    return len(seq) if seq else 0


def check_gesture_enrolled(user_id: int) -> bool:
    return is_enrolled(user_id, MODALITY)
