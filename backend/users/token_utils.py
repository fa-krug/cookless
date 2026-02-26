import hashlib
import secrets


def generate_token() -> tuple[str, str]:
    """Generate a new PAT. Returns (raw_token, token_hash)."""
    raw = "ckls_" + secrets.token_urlsafe(32)
    token_hash = hash_token(raw)
    return raw, token_hash


def hash_token(raw: str) -> str:
    """SHA-256 hex digest of a raw token string."""
    return hashlib.sha256(raw.encode()).hexdigest()
