import json
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.main import app  # noqa: E402


output = BACKEND_DIR / "openapi.json"
output.write_text(
    json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n",
    encoding="utf-8",
)
print(output)
