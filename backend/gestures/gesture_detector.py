import base64

import cv2
import mediapipe as mp
import numpy as np

mp_hands = mp.solutions.hands
_hands = mp_hands.Hands(max_num_hands=1, static_image_mode=True, min_detection_confidence=0.5)

ALLOWED = {"fist", "palm", "peace", "point", "three", "five", "rock", "two", "ok"}


def _fingers_up(hand):
    tips = [8, 12, 16, 20]
    return [1 if hand.landmark[t].y < hand.landmark[t - 2].y else 0 for t in tips]


def _classify(hand):
    f = _fingers_up(hand)
    total = sum(f)

    thumb_tip  = hand.landmark[4]
    thumb_mcp  = hand.landmark[2]
    thumb_open = thumb_tip.x < thumb_mcp.x

    if total == 0:
        return "fist"
    if total == 4:
        return "palm" if thumb_open else "five"
    if f == [1, 1, 0, 0]:
        return "peace"
    if f == [1, 0, 0, 0]:
        return "point"
    if f == [1, 1, 1, 0]:
        return "three"
    if f == [1, 1, 1, 1]:
        return "five"
    if f == [0, 0, 0, 1]:
        return "rock"
    if f == [0, 1, 0, 0]:
        return "two"
    if f == [0, 1, 1, 0]:
        return "ok"
    return None


def detect_gesture_from_frame(image_data: str) -> dict:
    try:
        raw = image_data.split(",")[1] if "," in image_data else image_data
        nparr = np.frombuffer(base64.b64decode(raw), np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None:
            return {"success": False, "error": "Could not decode image"}

        results = _hands.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        if not results.multi_hand_landmarks:
            return {"success": True, "hand_detected": False, "gesture": None}

        hand = results.multi_hand_landmarks[0]
        gesture = _classify(hand)
        landmarks = [(lm.x, lm.y) for lm in hand.landmark]

        return {
            "success": True,
            "hand_detected": True,
            "gesture": gesture,
            "landmarks": landmarks,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
