import cv2
import numpy as np
import time
from gesture_detector import detect_gesture

stored=np.load("models/gesture_sequence.npy",allow_pickle=True).tolist()

detected=[]
last=None
stable=0

cap=cv2.VideoCapture(0)

print("Repeat gesture password")

while True:

    ret,frame=cap.read()
    gesture=detect_gesture(frame)

    if gesture:

        cv2.putText(frame,gesture,(50,50),
                    cv2.FONT_HERSHEY_SIMPLEX,1,(0,255,0),2)

        if gesture==last:
            stable+=1
        else:
            stable=0

        if stable==20:

            detected.append(gesture)
            print("Detected:",gesture)

            time.sleep(1)
            stable=0

        last=gesture

    cv2.imshow("Verify Gesture",frame)

    if len(detected)==len(stored):
        break

    if cv2.waitKey(1)==27:
        break

cap.release()
cv2.destroyAllWindows()

print("Stored:",stored)
print("Detected:",detected)

if detected==stored:
    print("GESTURE VERIFIED")
    exit(0)
else:
    print("WRONG GESTURE")
    exit(1)