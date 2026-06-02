import random

WORDS = ["tiger", "green", "blue", "quantum", "access", "secure"]

def generate_challenge():
    word = random.choice(WORDS)
    number = random.randint(10, 99)

    challenge = f"Say: {word} {number}"
    expected = f"{word} {number}"
    
    return challenge, expected