from core.record import record_audio
from core.preprocess import preprocess_audio
from core.features import extract_voice_features
import numpy as np
import os
from utils.config import ENROLL_AUDIO_PATH, ENROLL_PATH

# ensure models folder exists
os.makedirs("models", exist_ok=True)

print("=== Voice Enrollment Started ===")
print("You will record 3 voice samples.")

feature_list = []

for i in range(1, 4):
    print(f"\nRecording sample {i}/3")
    
    audio_path = f"audio/enroll/enroll_{i}.wav"
    
    # record voice
    record_audio(audio_path)

    # preprocess
    clean_path = preprocess_audio(audio_path)

    # extract features
    VF = extract_voice_features(clean_path)

    feature_list.append(VF)

# convert list → numpy array
feature_array = np.array(feature_list)

# average the feature vectors
VF_enroll = np.mean(feature_array, axis=0)

# save template
np.save(ENROLL_PATH, VF_enroll)

print("\nEnrollment Complete!")
print("Voice template saved to:", ENROLL_PATH)