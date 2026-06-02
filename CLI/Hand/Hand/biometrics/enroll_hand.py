import cv2
import numpy as np
import mediapipe as mp
import os
import pickle
from sklearn import svm
from hand_features import extract_hand_features

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
MODEL_PATH = os.path.join(BASE_DIR,"models","hand_model.pkl")

mp_hands = mp.solutions.hands
hands = mp_hands.Hands(max_num_hands=1)

cap = cv2.VideoCapture(0)

features=[]
labels=[]

print("Show YOUR hand for enrollment")

while True:

    ret,frame = cap.read()
    rgb = cv2.cvtColor(frame,cv2.COLOR_BGR2RGB)

    results = hands.process(rgb)

    if results.multi_hand_landmarks:

        hand = results.multi_hand_landmarks[0]
        vec = extract_hand_features(hand)

        features.append(vec)
        labels.append(1)

        cv2.putText(frame,"Capturing user samples",
                    (50,50),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    1,(0,255,0),2)

    cv2.imshow("Enrollment",frame)

    if len(features)==120:
        break

    if cv2.waitKey(1)==27:
        break

cap.release()
cv2.destroyAllWindows()

print("Now show OTHER hand or random hand (negative samples)")

cap = cv2.VideoCapture(0)

while True:

    ret,frame = cap.read()
    rgb = cv2.cvtColor(frame,cv2.COLOR_BGR2RGB)

    results = hands.process(rgb)

    if results.multi_hand_landmarks:

        hand = results.multi_hand_landmarks[0]
        vec = extract_hand_features(hand)

        features.append(vec)
        labels.append(0)

        cv2.putText(frame,"Capturing negative samples",
                    (50,50),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    1,(0,0,255),2)

    cv2.imshow("Negative samples",frame)

    if len(labels)==240:
        break

    if cv2.waitKey(1)==27:
        break

cap.release()
cv2.destroyAllWindows()

features=np.array(features)
labels=np.array(labels)

print("Training SVM model...")

model = svm.SVC(kernel='rbf',probability=True)
model.fit(features,labels)

with open(MODEL_PATH,"wb") as f:
    pickle.dump(model,f)

print("Hand biometric model trained and saved")