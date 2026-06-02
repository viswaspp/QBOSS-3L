import os

SAMPLE_RATE = 16000
DURATION = 5  

THRESHOLD = 4.0

LEGACY_THRESHOLD = 90.0

BASE_DIR = os.path.dirname(os.path.dirname(__file__))

ENROLL_PATH = os.path.join(BASE_DIR, "models", "voice_template.npy")
LIVE_AUDIO_PATH = os.path.join(BASE_DIR, "audio", "live", "live.wav")
ENROLL_AUDIO_PATH = os.path.join(BASE_DIR, "audio", "enroll", "enroll.wav")
