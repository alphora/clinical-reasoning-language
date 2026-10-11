#!/usr/bin/env python3
"""ke-audit entry point. See ../CONTRACT.md. Requires Python 3.11+, standard library only."""
import sys
from pathlib import Path

if sys.version_info < (3, 11):
    sys.exit('ke-audit requires Python 3.11+')
sys.path.insert(0, str(Path(__file__).resolve().parent))
from ke_audit.cli import main  # noqa: E402

sys.exit(main())
