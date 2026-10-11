"""Audit-hook read guard (DESIGN §3, 184-J): fail closed on any open/list under a denied root.

Installed by `view` and `freeze`. Python audit hooks cannot be removed, so the guard lives for the process."""
import os
import sys

class GuardDenied(RuntimeError):
    """Raised on a denied access. Not an OSError, so no library treats it as a retryable filesystem race."""


_EVENTS = {'open', 'os.listdir', 'os.scandir', 'os.walk', 'glob.glob', 'shutil.copyfile', 'shutil.copytree', 'os.rename'}
_denied = []
_installed = False
_busy = False


def _norm(p):
    return os.path.normpath(os.path.abspath(p)).replace('\\', '/').casefold().rstrip('/') + '/'


def _hook(event, args):
    global _busy
    if _busy or event not in _EVENTS or not args:
        return
    target = args[0]
    if isinstance(target, int) or target is None:
        return
    try:
        _busy = True
        p = _norm(os.path.realpath(os.fsdecode(target)))
    except (TypeError, ValueError):
        return
    finally:
        _busy = False
    for d in _denied:
        if p.startswith(d):
            # OSError subclass that tempfile/mkstemp does not retry (it loops on PermissionError on Windows)
            raise GuardDenied(f'ke-audit guard: {event} of {os.fsdecode(target)} is denied (under {d.rstrip("/")})')


def install(deny_roots):
    """Deny every existing-or-future path under each root (realpath-resolved, case-folded)."""
    global _installed
    for r in deny_roots:
        if r:
            n = _norm(os.path.realpath(r))
            if n not in _denied:
                _denied.append(n)
    if not _installed:
        sys.addaudithook(_hook)
        _installed = True


def denied():
    return [d.rstrip('/') for d in _denied]
