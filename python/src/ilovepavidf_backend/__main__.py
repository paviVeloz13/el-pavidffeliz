"""CLI entrypoint for the persistent iLovePaviDF backend worker."""

from .worker import main


if __name__ == "__main__":
    raise SystemExit(main())
