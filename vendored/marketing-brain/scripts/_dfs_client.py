"""
DataForSEO HTTP client with cost caps, retry/backoff, and raw-response capture.

Purpose
-------
Shared transport layer used by every pipeline script that hits DataForSEO.
Handles HTTP Basic Auth, JSON serialization, retry-with-backoff, per-call and
total cost caps, and persistence of raw responses for auditability.

Inputs
------
- Environment variables ``DATAFORSEO_LOGIN`` and ``DATAFORSEO_PASSWORD``.
- Caller supplies endpoint path (e.g. ``/v3/serp/google/organic/live/regular``),
  payload (a list of task dicts per DataForSEO convention), a label for logging,
  and an optional path to write the raw JSON response.

Outputs
-------
- Returns parsed JSON dict from the API.
- Writes raw response JSON to ``save_to`` path if provided.
- Updates the module-level cost accumulator.
- Raises ``CostCapExceeded`` if a cap is hit; the caller should catch this,
  flush partial state, and exit non-zero.

Cost
----
Pure transport: only the calls themselves cost money. Default caps:
- per-call: $0.50
- total:    $5.00

Stdlib only. Python 3.10+.
"""

from __future__ import annotations

import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

API_BASE = "https://api.dataforseo.com"
DEFAULT_PER_CALL_CAP = 0.50
DEFAULT_TOTAL_CAP = 5.00
DEFAULT_TIMEOUT = 120
DEFAULT_MAX_RETRIES = 3
DEFAULT_BACKOFF_BASE = 1.0  # seconds; 1, 2, 4

# Module-level state ----------------------------------------------------------
_total_cost: float = 0.0
_per_call_cap: float = DEFAULT_PER_CALL_CAP
_total_cap: float = DEFAULT_TOTAL_CAP


class CostCapExceeded(RuntimeError):
    """Raised when a per-call or total cost cap would be exceeded.

    Callers should catch this, write partial output / update the manifest,
    then ``sys.exit(1)`` so the shell sees a non-zero exit code.
    """

    def __init__(self, message: str, *, cap_type: str, cost: float, cap: float) -> None:
        super().__init__(message)
        self.cap_type = cap_type
        self.cost = cost
        self.cap = cap


class DataForSEOError(RuntimeError):
    """Raised on a non-retryable API or auth error."""


# Public API -----------------------------------------------------------------
def set_caps(per_call: float | None = None, total: float | None = None) -> None:
    """Override the default per-call and/or total cost caps.

    Pass ``None`` to leave a cap unchanged. Caps are applied to subsequent
    calls; calls already in flight are unaffected.
    """
    global _per_call_cap, _total_cap
    if per_call is not None:
        if per_call <= 0:
            raise ValueError("per_call cap must be > 0")
        _per_call_cap = float(per_call)
    if total is not None:
        if total <= 0:
            raise ValueError("total cap must be > 0")
        _total_cap = float(total)


def total_cost() -> float:
    """Return cumulative spend (USD) across all calls in this process."""
    return _total_cost


def reset_total() -> None:
    """Reset the cumulative spend counter. Useful for tests and resumed runs."""
    global _total_cost
    _total_cost = 0.0


def get_caps() -> tuple[float, float]:
    """Return ``(per_call_cap, total_cap)``."""
    return _per_call_cap, _total_cap


def require_credentials() -> None:
    """Exit with the standard credential error before a live command writes state."""
    _read_credentials()


def call(
    endpoint: str,
    payload: list[dict[str, Any]],
    label: str,
    save_to: Path | str | None = None,
    *,
    timeout: int = DEFAULT_TIMEOUT,
    max_retries: int = DEFAULT_MAX_RETRIES,
) -> dict[str, Any]:
    """POST ``payload`` to DataForSEO ``endpoint`` and return parsed JSON.

    Args:
        endpoint: Path beginning with ``/v3/...`` (e.g.
            ``/v3/serp/google/organic/live/regular``).
        payload: List of task dicts (DataForSEO convention).
        label: Short string used in log lines for traceability.
        save_to: Optional file path; raw JSON response is written here.
        timeout: HTTP timeout in seconds.
        max_retries: Number of retry attempts on transient (5xx, network) errors.

    Returns:
        Parsed JSON dict.

    Raises:
        CostCapExceeded: When the call's reported cost would push the per-call
            or cumulative total above its cap. The raw response is still saved
            (so the caller can audit what was paid for) and the cost is added
            to the accumulator BEFORE the exception is raised.
        DataForSEOError: On 4xx, auth failure, or a non-20000 status code.
        urllib.error.URLError: On unrecoverable network failure after retries.
    """
    global _total_cost

    login, password = _read_credentials()
    url = f"{API_BASE}{endpoint}"
    body = json.dumps(payload).encode("utf-8")
    auth_header = "Basic " + base64.b64encode(f"{login}:{password}".encode("utf-8")).decode("ascii")
    headers = {
        "Authorization": auth_header,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    data = _post_with_retry(url, body, headers, timeout=timeout, max_retries=max_retries, label=label)

    # Save raw response immediately — even if a cap or status check fails next,
    # the operator needs the audit trail.
    if save_to is not None:
        save_path = Path(save_to)
        write_private_text(save_path, json.dumps(data, indent=2) + "\n")

    # API-level error check.
    api_status = data.get("status_code")
    if api_status != 20000:
        raise DataForSEOError(
            f"[{label}] DataForSEO API status {api_status}: {data.get('status_message')}"
        )

    # Cost accounting. DataForSEO reports cost on the top-level response; some
    # endpoints also report per-task. We trust the top-level number.
    cost = float(data.get("cost") or 0.0)
    if cost > _per_call_cap:
        # We add the cost to total before raising so the audit reflects spend.
        _total_cost += cost
        raise CostCapExceeded(
            f"[{label}] per-call cost ${cost:.4f} exceeds cap ${_per_call_cap:.2f}",
            cap_type="per_call",
            cost=cost,
            cap=_per_call_cap,
        )

    if _total_cost + cost > _total_cap:
        # Add the cost so the operator sees what would have been spent.
        _total_cost += cost
        raise CostCapExceeded(
            f"[{label}] total cost ${_total_cost:.4f} exceeds cap ${_total_cap:.2f}",
            cap_type="total",
            cost=cost,
            cap=_total_cap,
        )

    _total_cost += cost
    print(f"[dfs] {label}: status={api_status} cost=${cost:.4f} total=${_total_cost:.4f}", file=sys.stderr)
    return data


# Internals -------------------------------------------------------------------
def _read_credentials() -> tuple[str, str]:
    login = os.environ.get("DATAFORSEO_LOGIN")
    password = os.environ.get("DATAFORSEO_PASSWORD")
    if not login or not password:
        sys.stderr.write(
            "ERROR: DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD environment variables\n"
            "must both be set. Export them in your shell:\n\n"
            "    export DATAFORSEO_LOGIN='your-login'\n"
            "    export DATAFORSEO_PASSWORD='your-password'\n\n"
            "Never commit credentials to a file inside the vault.\n"
        )
        sys.exit(2)
    return login, password


def write_private_text(path: Path | str, text: str) -> None:
    """Write raw paid-data/source text with private owner-only permissions."""
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
    fd = os.open(target, flags, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
    finally:
        try:
            os.chmod(target, 0o600)
        except OSError:
            pass


def _post_with_retry(
    url: str,
    body: bytes,
    headers: dict[str, str],
    *,
    timeout: int,
    max_retries: int,
    label: str,
) -> dict[str, Any]:
    """POST with exponential backoff on transient failures.

    Retries on: connection errors, socket timeouts, HTTP 5xx.
    Gives up immediately on: HTTP 4xx (likely permanent — bad payload, auth,
    or rate limit — though 429 is technically retryable, DataForSEO returns
    20100 inside a 200 for queue conditions, so a real 4xx here is almost
    always our fault).
    """
    last_exc: Exception | None = None
    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(url, data=body, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=timeout) as response:
                raw = response.read()
            return json.loads(raw.decode("utf-8"))
        except urllib.error.HTTPError as exc:
            # 4xx is a hard fail. Body usually contains an error explanation.
            if 400 <= exc.code < 500:
                try:
                    err_body = exc.read().decode("utf-8", errors="replace")
                except Exception:
                    err_body = ""
                raise DataForSEOError(
                    f"[{label}] HTTP {exc.code} {exc.reason}: {err_body[:500]}"
                ) from exc
            last_exc = exc
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            last_exc = exc
        # Backoff before the next attempt.
        if attempt < max_retries - 1:
            sleep_for = DEFAULT_BACKOFF_BASE * (2**attempt)
            print(
                f"[dfs] {label}: transient failure ({type(last_exc).__name__}: {last_exc}); "
                f"retrying in {sleep_for:.1f}s ({attempt + 1}/{max_retries})",
                file=sys.stderr,
            )
            time.sleep(sleep_for)
    assert last_exc is not None
    raise last_exc


__all__ = [
    "CostCapExceeded",
    "DataForSEOError",
    "call",
    "get_caps",
    "reset_total",
    "set_caps",
    "total_cost",
]
