import cv2
import numpy as np
import mediapipe as mp
import pickle
import base64
from .hand_features import extract_hand_features
from db.biometric_store import is_enrolled, load_biometric, log_verification

MODALITY = "hand"

mp_hands = mp.solutions.hands
hands = mp_hands.Hands(max_num_hands=1, static_image_mode=True, min_detection_confidence=0.5)


def process_hand_frame(image_data):
    try:
        img_bytes = base64.b64decode(image_data.split(",")[1] if "," in image_data else image_data)
        nparr = np.frombuffer(img_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None:
            return {"success": False, "error": "Could not decode image"}
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = hands.process(rgb)
        if not results.multi_hand_landmarks:
            return {"success": True, "hand_detected": False}
        landmarks = [(lm.x, lm.y) for lm in results.multi_hand_landmarks[0].landmark]
        return {"success": True, "hand_detected": True, "landmarks": landmarks}
    except Exception as e:
        return {"success": False, "error": str(e)}


def verify_hand_features(user_id: int, landmarks_list):
    if not is_enrolled(user_id, MODALITY):
        return {"success": False, "error": "Hand not enrolled for this user."}
    try:
        model = pickle.loads(load_biometric(user_id, MODALITY))
        features = [extract_hand_features(lm) for lm in landmarks_list]
        test_vec = np.mean(features, axis=0).reshape(1, -1)
        prediction = int(model.predict(test_vec)[0])
        confidence = float(model.predict_proba(test_vec)[0][1])
        verified = prediction == 1 and confidence > 0.8
        log_verification(user_id, MODALITY, verified, f"confidence={confidence:.4f}")
        return {"success": True, "verified": verified, "confidence": round(confidence, 4),
                "message": "Hand verified!" if verified else "Hand mismatch"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def check_hand_enrolled(user_id: int) -> bool:
    return is_enrolled(user_id, MODALITY)
