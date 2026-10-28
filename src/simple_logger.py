import logging


def setup_logging(level=logging.INFO):
    """Configure the root logger with a simple console handler.

    Safe to call multiple times; it will not add duplicate handlers.
    """
    fmt = '%(asctime)s %(levelname)s %(name)s: %(message)s'
    root = logging.getLogger()
    # avoid adding multiple handlers when called repeatedly
    if not any(isinstance(h, logging.StreamHandler) for h in root.handlers):
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter(fmt))
        root.addHandler(handler)
    root.setLevel(level)


def get_logger(name=None):
    if name is None:
        name = __name__
    return logging.getLogger(name)
