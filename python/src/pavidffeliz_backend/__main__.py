"""CLI entrypoint for the persistent El PaviDFeliz backend worker."""

from .worker import main


if __name__ == "__main__":
    raise SystemExit(main())
