"""Normalize legacy Firestore Timestamp fields to millisecond integers.

The script is dry-run by default. Run with ``--apply`` once before enabling
createdAt cursor pagination for a database that contains legacy Timestamp data.
"""

import argparse
import sys
from datetime import datetime
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.firebase import get_firestore_client  # noqa: E402


BATCH_SIZE = 400


def milliseconds(value: object) -> int | None:
    if isinstance(value, datetime):
        return int(value.timestamp() * 1000)
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="write normalized values")
    args = parser.parse_args()

    db = get_firestore_client()
    pending: list[tuple[object, dict[str, int]]] = []
    scanned = 0

    for snapshot in db.collection("notes").stream():
        scanned += 1
        data = snapshot.to_dict()
        changes = {}
        created_at = milliseconds(data.get("createdAt"))
        updated_at = milliseconds(data.get("updatedAt"))
        if created_at is not None:
            changes["createdAt"] = created_at
        if updated_at is not None:
            changes["updatedAt"] = updated_at
        if changes:
            pending.append((snapshot.reference, changes))

    print(f"Scanned {scanned} notes; {len(pending)} require normalization.")
    if not args.apply:
        print("Dry run only. Re-run with --apply to write changes.")
        return 0

    for start in range(0, len(pending), BATCH_SIZE):
        batch = db.batch()
        for reference, changes in pending[start : start + BATCH_SIZE]:
            batch.update(reference, changes)
        batch.commit()

    print(f"Normalized {len(pending)} notes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
