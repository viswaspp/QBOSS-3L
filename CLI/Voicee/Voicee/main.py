from core.record import record_audio
from core.preprocess import preprocess_audio
from core.features import extract_voice_features
from core.qnv import generate_qnv
from core.fusion import fuse_voice_qnv
from core.verify import verify_voice
from core.challenge import generate_challenge
from utils.config import LIVE_AUDIO_PATH
import pyttsx3

# TTS announce challenge
tts = pyttsx3.init()

# Step 1: Generate challenge
challenge, expected = generate_challenge()
print("Challenge:", challenge)
tts.say(challenge)
tts.runAndWait()

# Step 2: Record user response
record_audio(LIVE_AUDIO_PATH)

# Step 3: STT check (You can add Whisper later)
print("⚠ For now, skip STT check manually:")
print("Did user say:", expected, "? (y/n)")
check = input("Enter y/n: ")

if check.lower() != "y":
    print("❌ Challenge mismatch — Access Denied")
    exit()

# Step 4: Extract features
clean_path = preprocess_audio(LIVE_AUDIO_PATH)
VF_test = extract_voice_features(clean_path)

# Step 5: Generate QNV
QNV = generate_qnv(len(VF_test))

# Step 6: Fuse
QNVS = fuse_voice_qnv(VF_test, QNV)

# Step 7: Verify identity
if verify_voice(QNVS):
    print("✅ Access Granted!")
    print("Secure data unlocked:")
    with open("secure/data.txt") as f:
        print(f.read())
else:
    print("❌ Access Denied (Voice mismatch)")