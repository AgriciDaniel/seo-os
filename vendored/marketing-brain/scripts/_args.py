"""
Shared argparse helpers used by the pipeline entry-point scripts.

Two utilities live here because they have three or more callers in the
pipeline scripts and copy-pasting them would drift over time:

- ``bounded_int(min, max, name)`` — argparse type that rejects ints outside
  a closed interval. Used to fail-fast on absurd ``--top``, ``--depth``,
  ``--limit-per-comp`` values that would otherwise burn DataForSEO budget
  before the cost cap fires.
- ``validate_site_url(url)`` — refuses non-http(s) schemes, loopback
  hostnames, and loopback/private/link-local IP literals. Defends against
  ``--site file:///etc/passwd`` and ``--site http://169.254.169.254/...``
  (cloud-metadata SSRF) on hosts where the script may run with elevated
  network access.

Stdlib only. Python 3.10+.
"""

from __future__ import annotations

import argparse
import ipaddress
from typing import Callable
from urllib.parse import urlparse

# Loopback hostnames that are never legitimate --site values.
_BLOCKED_HOSTS = {"localhost", "ip6-localhost", "ip6-loopback"}


def bounded_int(min_val: int, max_val: int, *, name: str) -> Callable[[str], int]:
    """Return an argparse ``type=`` callable that enforces ``[min_val, max_val]``.

    The factory pattern lets each caller supply its own ``name`` so error
    messages name the actual flag (``--top``) rather than a generic 'value'.
    """
    def _check(raw: str) -> int:
        try:
            n = int(raw)
        except ValueError:
            raise argparse.ArgumentTypeError(f"{name}: not an integer: {raw!r}")
        if not (min_val <= n <= max_val):
            raise argparse.ArgumentTypeError(
                f"{name}: must be in [{min_val}, {max_val}], got {n}"
            )
        return n
    return _check


def validate_site_url(url: str) -> str:
    """Refuse URLs that would let ``--site`` become an SSRF / local-file vector.

    Allowed: ``http://`` and ``https://`` against a routable public hostname.
    Refused: any other scheme (``file://``, ``gopher://``, ``ftp://``...),
    loopback hostnames, loopback/private/link-local/multicast IP literals,
    and bare hostnames with no scheme.

    Designed for argparse ``type=`` use — raises ``ArgumentTypeError`` with
    a clear message instead of returning silently.
    """
    p = urlparse(url)
    if p.scheme not in ("http", "https"):
        raise argparse.ArgumentTypeError(
            f"--site scheme must be http or https, got {p.scheme!r} from {url!r}"
        )
    host = (p.hostname or "").lower()
    if not host:
        raise argparse.ArgumentTypeError(f"--site missing hostname: {url!r}")
    if host in _BLOCKED_HOSTS:
        raise argparse.ArgumentTypeError(f"--site refers to a loopback hostname: {host!r}")
    try:
        ip = ipaddress.ip_address(host)
        if ip.is_loopback or ip.is_private or ip.is_link_local or ip.is_multicast:
            raise argparse.ArgumentTypeError(
                f"--site IP {host} is loopback/private/link-local/multicast; refusing"
            )
    except ValueError:
        # Not an IP literal; the operator passed a DNS name. We don't pre-resolve
        # because (a) it's a network call at parse time and (b) DNS rebinding
        # makes pre-resolution moot.
        pass
    return url


__all__ = ["bounded_int", "validate_site_url"]
