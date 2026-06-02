import subprocess
import os

if not os.path.exists("models/hand_template.npy"):

    print("No hand template found. Starting enrollment...")
    subprocess.run(["python","biometrics/enroll_hand.py"])

print("\n=== MULTI-FACTOR AUTHENTICATION ===")

print("Step 1 : Hand Biometric Verification")

hand = subprocess.run(["python","biometrics/verify_hand.py"])

if hand.returncode != 0:

    print("ACCESS DENIED (Hand mismatch)")
    exit()

print("\nStep 2 : Gesture Password")

gesture = subprocess.run(["python","gestures/verify_gesture.py"])

if gesture.returncode != 0:

    print("ACCESS DENIED (Wrong gesture)")
    exit()

print("\nACCESS GRANTED")