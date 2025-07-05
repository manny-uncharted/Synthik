import hmac
import hashlib

def verify_signature(secret: str, payload: bytes, signature_header: str) -> bool:
    """
    Compute HMAC-SHA256 over `payload` with `secret` and compare
    to `signature_header` (“sha256=…”).
    """
    if not signature_header or not secret:
        return False
    expected = "sha256=" + hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header)
