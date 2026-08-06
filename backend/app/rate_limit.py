from collections import defaultdict, deque
from math import ceil
from threading import Lock
from time import monotonic

from fastapi import Depends, HTTPException, status

from .config import Settings, get_settings
from .dependencies import get_current_uid


class InMemoryRateLimiter:
    def __init__(
        self,
        max_requests: int,
        window_seconds: int,
        *,
        error_detail: str = "Rate limit exceeded. Please try again later.",
    ) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.error_detail = error_detail
        self._requests: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, key: str, *, max_requests: int | None = None) -> None:
        request_limit = max_requests if max_requests is not None else self.max_requests
        with self._lock:
            now = monotonic()
            window_start = now - self.window_seconds
            requests = self._requests[key]

            while requests and requests[0] < window_start:
                requests.popleft()

            if len(requests) >= request_limit:
                retry_after = max(1, ceil(requests[0] + self.window_seconds - now))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=self.error_detail,
                    headers={"Retry-After": str(retry_after)},
                )

            requests.append(now)

    def reset(self) -> None:
        with self._lock:
            self._requests.clear()


read_notes_limiter = InMemoryRateLimiter(max_requests=120, window_seconds=60)
write_notes_limiter = InMemoryRateLimiter(max_requests=30, window_seconds=60)

# This protects each application instance from accidental or abusive AI spend.
# Serverless instances do not share this in-memory budget, so it is not a global
# distributed security control.
ai_limiter = InMemoryRateLimiter(
    max_requests=10,
    window_seconds=60,
    error_detail="AI request rate limit exceeded. Please try again later.",
)


def read_limited_uid(uid: str = Depends(get_current_uid)) -> str:
    read_notes_limiter.check(uid)
    return uid


def write_limited_uid(uid: str = Depends(get_current_uid)) -> str:
    write_notes_limiter.check(uid)
    return uid


def ai_limited_uid(
    uid: str = Depends(get_current_uid),
    settings: Settings = Depends(get_settings),
) -> str:
    ai_limiter.check(
        uid,
        max_requests=settings.siliconflow_ai_rate_limit_per_minute,
    )
    return uid
