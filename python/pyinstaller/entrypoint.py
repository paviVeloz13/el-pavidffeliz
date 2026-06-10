"""PyInstaller entrypoint — uses absolute imports, no package context needed."""
import sys
import os

# Ensure src/ is on the path when running from source (not needed in frozen bundle)
_here = os.path.dirname(os.path.abspath(__file__))
_src = os.path.join(os.path.dirname(_here), "src")
if _src not in sys.path:
    sys.path.insert(0, _src)

from ilovepavidf_backend.worker import main

if __name__ == "__main__":
    raise SystemExit(main())
