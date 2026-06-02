import sounddevice as sd
import soundfile as sf
import os
from utils.config import SAMPLE_RATE, DURATION

def record_audio(path, duration=DURATION):
    # Create folder if not exists
    os.makedirs(os.path.dirname(path), exist_ok=True)

    print("🎤 Speak now...")
    audio = sd.rec(int(duration * SAMPLE_RATE), samplerate=SAMPLE_RATE, channels=1)
    sd.wait()
    sf.write(path, audio, SAMPLE_RATE)
    print(f"Saved audio to {path}")