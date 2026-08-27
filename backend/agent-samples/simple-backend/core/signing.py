import hashlib
import hmac
import time


def build_signature_headers(secret, method, path, payload):
    timestamp = str(int(time.time()))
    canonical = f"{timestamp}.{method}.{path}.{payload}".encode("utf-8")
    signature = hmac.new(
        secret.encode("utf-8"),
        canonical,
        hashlib.sha256,
    ).hexdigest()
    return {
        "X-Consultant-Timestamp": timestamp,
        "X-Consultant-Signature": signature,
    }
