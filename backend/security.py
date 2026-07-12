from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets


PASSWORD_ITERATIONS_FLOOR = 240_000
PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256"


def password_iterations() -> int:
    raw = os.environ.get("MEDLIFE_PASSWORD_PBKDF2_ITERATIONS", str(PASSWORD_ITERATIONS_FLOOR)).strip()
    try:
        value = int(raw)
    except ValueError:
        return PASSWORD_ITERATIONS_FLOOR
    return max(value, PASSWORD_ITERATIONS_FLOOR)


def random_token(bytes_length: int = 32) -> str:
    return secrets.token_urlsafe(bytes_length)


def _password_digest(password: str, salt: str, iterations: int) -> str:
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    )
    return base64.b64encode(digest).decode("ascii")


def hash_password(password: str, salt: str | None = None, *, iterations: int | None = None) -> tuple[str, str]:
    resolved_iterations = max(iterations or password_iterations(), PASSWORD_ITERATIONS_FLOOR)
    resolved_salt = salt or base64.b64encode(secrets.token_bytes(16)).decode("ascii")
    digest = _password_digest(password, resolved_salt, resolved_iterations)
    return f"{PASSWORD_HASH_ALGORITHM}${resolved_iterations}${digest}", resolved_salt


def verify_password(password: str, expected_hash: str, salt: str) -> bool:
    actual_hash, _ = hash_password(password, salt=salt, iterations=password_hash_iterations(expected_hash))
    return hmac.compare_digest(actual_hash, expected_hash)


def password_hash_iterations(expected_hash: str) -> int:
    parts = expected_hash.split("$", 2)
    if len(parts) == 3 and parts[0] == PASSWORD_HASH_ALGORITHM:
        try:
            return max(int(parts[1]), PASSWORD_ITERATIONS_FLOOR)
        except ValueError:
            return PASSWORD_ITERATIONS_FLOOR
    return PASSWORD_ITERATIONS_FLOOR


def password_hash_needs_rehash(expected_hash: str) -> bool:
    return password_hash_iterations(expected_hash) < password_iterations()


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def compare_token_hash(token: str, expected_hash: str) -> bool:
    return hmac.compare_digest(hash_token(token), expected_hash)
