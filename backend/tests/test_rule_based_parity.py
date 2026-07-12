from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

_ROOT_DIR = Path(__file__).resolve().parents[2]
if str(_ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(_ROOT_DIR))

from backend import server  # noqa: E402


def _normalize(value):
    if isinstance(value, dict):
        return {
            key: _normalize(item)
            for key, item in value.items()
            if not (key == "guideline_ref" and item is None)
        }
    if isinstance(value, list):
        return [_normalize(item) for item in value]
    return value


class RuleBasedParityTests(unittest.TestCase):
    def test_shared_rule_based_fixtures_match_backend_outputs(self) -> None:
        fixture_dir = _ROOT_DIR / "fixtures" / "rule-based"
        for request_path in sorted(fixture_dir.glob("*.request.json")):
            expected_path = request_path.with_name(
                request_path.name.replace(".request.json", ".expected.json")
            )
            with self.subTest(case=request_path.stem):
                request_payload = json.loads(request_path.read_text(encoding="utf-8"))
                expected_payload = json.loads(expected_path.read_text(encoding="utf-8"))
                model = server.DebriefRequestModel.model_validate(request_payload)
                actual = _normalize(server.build_rule_based_assessment(model).model_dump(mode="json"))
                self.assertEqual(actual, expected_payload)


if __name__ == "__main__":
    unittest.main()
