from __future__ import annotations

import os
from unittest.mock import patch

from .security import PASSWORD_HASH_ALGORITHM, PASSWORD_ITERATIONS_FLOOR
from .server import _validate_runtime_configuration


def main() -> int:
    with patch.dict(
        os.environ,
        {
            "MEDLIFE_ENV": "production",
            "MEDLIFE_COOKIE_SECURE": "1",
            "MEDLIFE_CORS_ORIGINS": "https://medlife.example",
        },
        clear=False,
    ):
        _validate_runtime_configuration()
    with patch.dict(
        os.environ,
        {
            "MEDLIFE_ENV": "production",
            "MEDLIFE_COOKIE_SECURE": "0",
            "MEDLIFE_CORS_ORIGINS": "https://medlife.example",
        },
        clear=False,
    ):
        try:
            _validate_runtime_configuration()
        except RuntimeError:
            pass
        else:
            raise AssertionError("unsafe production cookie config should fail")
    print(f"password_algorithm={PASSWORD_HASH_ALGORITHM}")
    print(f"password_iterations_floor={PASSWORD_ITERATIONS_FLOOR}")
    print("verify:security-config PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
