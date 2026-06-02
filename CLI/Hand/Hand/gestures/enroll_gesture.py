import cv2
import numpy as np
import time
from gesture_detector import detect_gesture

cap=cv2.VideoCapture(0)

sequence=[]
last=None
stable=0

print("Perform 3 gesture password")

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

            print("Captured:",gesture)
            sequence.append(gesture)

            time.sleep(1)
            stable=0

        last=gesture

    cv2.imshow("Enroll Gesture",frame)

    if len(sequence)==3:
        break

    if cv2.waitKey(1)==27:
        break

cap.release()
cv2.destroyAllWindows()

np.save("models/gesture_sequence.npy",sequence)

print("Saved gesture sequence:",sequence)