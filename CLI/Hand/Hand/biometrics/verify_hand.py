import cv2
import numpy as np
import mediapipe as mp
import os
import pickle
from hand_features import extract_hand_features

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
MODEL_PATH = os.path.join(BASE_DIR,"models","hand_model.pkl")

with open(MODEL_PATH,"rb") as f:
    model = pickle.load(f)

mp_hands = mp.solutions.hands
hands = mp_hands.Hands(max_num_hands=1)

cap = cv2.VideoCapture(0)

samples=[]

print("Verifying hand...")

while True:

    ret,frame = cap.read()
    rgb = cv2.cvtColor(frame,cv2.COLOR_BGR2RGB)

    results = hands.process(rgb)

    if results.multi_hand_landmarks:

        hand = results.multi_hand_landmarks[0]
        vec = extract_hand_features(hand)

        samples.append(vec)

        cv2.putText(frame,"Capturing verification...",
                    (50,50),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    1,(0,255,0),2)

        if len(samples)==25:

            test_vec = np.mean(samples,axis=0).reshape(1,-1)

            prediction = model.predict(test_vec)[0]
            confidence = model.predict_proba(test_vec)[0][1]

            print("Prediction:",prediction)
            print("Confidence:",confidence)

            cap.release()
            cv2.destroyAllWindows()

            if prediction==1 and confidence>0.8:
                print("HAND VERIFIED")
                exit(0)
            else:
                print("WRONG HAND")
                exit(1)

    cv2.imshow("Verify Hand",frame)

    if cv2.waitKey(1)==27:
        break