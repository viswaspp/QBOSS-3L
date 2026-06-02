import secrets
import time

WORDS = ["tiger", "green", "blue", "quantum", "access", "secure", "vector", "phase", "signal", "lattice"]
CHALLENGE_TTL_SECONDS = 90
_ACTIVE_CHALLENGES = {}


def _cleanup():
    now = time.time()
    expired = [token for token, item in _ACTIVE_CHALLENGES.items() if item["expires_at"] <= now]
    for token in expired:
        _ACTIVE_CHALLENGES.pop(token, None)


def generate_challenge():
    """Generate a fresh challenge phrase and one-time challenge id."""
    _cleanup()
    word = secrets.choice(WORDS)
    number = secrets.randbelow(90) + 10
    token = secrets.token_urlsafe(24)
    expected = f"{word} {number}"
    challenge = f"Say: {expected}"
    _ACTIVE_CHALLENGES[token] = {
        "expected": expected,
        "issued_at": time.time(),
        "expires_at": time.time() + CHALLENGE_TTL_SECONDS,
    }
    return token, challenge, expected, _ACTIVE_CHALLENGES[token]["expires_at"]


def get_challenge() -> dict:
    """Return voice challenge metadata used by the browser and verifier."""
    token, challenge, expected, expires_at = generate_challenge()
    return {
        "challenge_id": token,
        "challenge": challenge,
        "expected": expected,
        "expires_in": CHALLENGE_TTL_SECONDS,
        "expires_at": expires_at,
    }


def consume_challenge(challenge_id: str) -> tuple[bool, str]:
    """Validate and consume a one-time challenge id."""
    _cleanup()
    if not challenge_id:
        return False, "Fresh voice challenge required."
    item = _ACTIVE_CHALLENGES.pop(challenge_id, None)
    if not item:
        return False, "Voice challenge expired or already used."
    return True, item["expected"]
