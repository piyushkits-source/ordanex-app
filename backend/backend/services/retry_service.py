from __future__ import annotations

from datetime import datetime, timedelta, timezone


RETRY_MINUTES = {
    1: 0,
    2: 2,
    3: 5,
    4: 15,
    5: 30,
}


def get_next_retry_time(attempts: int) -> datetime:
    minutes = RETRY_MINUTES.get(attempts, 60)
    return datetime.now(timezone.utc) + timedelta(minutes=minutes)


def should_retry(attempts: int, max_attempts: int = 5) -> bool:
    return attempts < max_attempts


def next_retry_payload(attempts: int, max_attempts: int = 5) -> dict:
    allowed = should_retry(attempts, max_attempts=max_attempts)
    return {
        "should_retry": allowed,
        "next_retry_at": get_next_retry_time(attempts).isoformat() if allowed else None,
        "max_attempts": max_attempts,
    }