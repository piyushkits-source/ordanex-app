from __future__ import annotations

import time
from typing import Callable


RETRYABLE_HTTP_CODES = {408, 425, 429, 500, 502, 503, 504}


def should_retry(result: dict) -> bool:
    if result.get("success"):
        return False

    status_code = result.get("status_code")
    if status_code in RETRYABLE_HTTP_CODES:
        return True

    msg = str(result.get("message") or "").lower()
    retry_words = ["timeout", "tempor", "connection", "reset", "unavailable"]
    return any(w in msg for w in retry_words)


def run_with_retry(fn: Callable[[], dict], max_attempts: int = 3, base_sleep_seconds: float = 2.0) -> dict:
    last_result = None

    for attempt in range(1, max_attempts + 1):
        try:
            result = fn()
        except Exception as e:
            result = {
                "success": False,
                "message": str(e),
                "status_code": None,
                "attempt": attempt,
            }

        result["attempt"] = attempt
        last_result = result

        if result.get("success"):
            return result

        if attempt < max_attempts and should_retry(result):
            time.sleep(base_sleep_seconds * attempt)
            continue

        return result

    return last_result or {
        "success": False,
        "message": "Unknown release failure",
        "status_code": None,
        "attempt": max_attempts,
    }
