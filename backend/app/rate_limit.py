from collections import defaultdict, deque
from time import monotonic

from fastapi import Depends, HTTPException, status

from .dependencies import get_current_uid


class InMemoryRateLimiter:
    def __init__(self, max_requests: int, window_seconds: int) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._requests: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = monotonic()
        window_start = now - self.window_seconds
        requests = self._requests[key]

        while requests and requests[0] < window_start:
            requests.popleft()

        if len(requests) >= self.max_requests:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded. Please try again later.",
            )

        requests.append(now)

    def reset(self) -> None:
        self._requests.clear()


read_notes_limiter = InMemoryRateLimiter(max_requests=120, window_seconds=60)
write_notes_limiter = InMemoryRateLimiter(max_requests=30, window_seconds=60)


def read_limited_uid(uid: str = Depends(get_current_uid)) -> str:
    read_notes_limiter.check(uid)
    return uid


def write_limited_uid(uid: str = Depends(get_current_uid)) -> str:
    write_notes_limiter.check(uid)
    return uid

