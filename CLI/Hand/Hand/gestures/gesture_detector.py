import cv2
import mediapipe as mp

mp_hands = mp.solutions.hands
hands = mp_hands.Hands(max_num_hands=1)

def detect_gesture(frame):

    rgb = cv2.cvtColor(frame,cv2.COLOR_BGR2RGB)
    results = hands.process(rgb)

    if not results.multi_hand_landmarks:
        return None

    hand = results.multi_hand_landmarks[0]

    tips=[4,8,12,16,20]
    fingers=[]

    for tip in tips[1:]:
        if hand.landmark[tip].y < hand.landmark[tip-2].y:
            fingers.append(1)
        else:
            fingers.append(0)

    total=sum(fingers)

    if total==0:
        return "fist"

    if total==4:
        return "palm"

    if fingers==[1,1,0,0]:
        return "peace"

    if fingers==[1,0,0,0]:
        return "point"

    if fingers == [1,1,1,0]:
        return "three"

    if fingers == [1,1,1,1]:
        return "five"

    if fingers == [0,1,1,1]:
        return "rock"

    if fingers == [0,1,0,0]:
        return "two"

    if fingers == [0,1,1,0]:
        return "ok"

    return None