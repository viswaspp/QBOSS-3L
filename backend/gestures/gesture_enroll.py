import json
from db.biometric_store import save_biometric

MODALITY = "gesture"
ALLOWED = {"fist", "palm", "peace", "point", "three", "five", "rock", "two", "ok"}


def enroll_gesture_sequence(user_id: int, sequence):
    if not isinstance(sequence, list) or len(sequence) < 1:
        return {"success": False, "error": "Gesture sequence must be a non-empty list."}
    invalid = [g for g in sequence if g not in ALLOWED]
    if invalid:
        return {"success": False, "error": f"Unsupported gestures: {', '.join(invalid)}"}
    try:
        save_biometric(user_id, MODALITY, json.dumps(sequence).encode(), meta={"sequence_length": len(sequence)})
        return {"success": True, "message": "Gesture password enrolled.", "sequence": sequence}
    except Exception as e:
        return {"success": False, "error": str(e)}
