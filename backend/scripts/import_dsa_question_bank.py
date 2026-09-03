"""Idempotently publish backend/data/dsa_question_bank.json to Supabase.

Run schema_dsa_question_bank.sql first, then:
    python scripts/import_dsa_question_bank.py
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import sys
import uuid
from datetime import datetime, timezone
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).parents[1]
DATA_PATH = BACKEND_DIR / "data" / "dsa_question_bank.json"
NAMESPACE = uuid.UUID("37b99f4e-9341-48bd-a602-f63f3a9112a8")


def stable_id(kind: str, key: str) -> str:
    return str(uuid.uuid5(NAMESPACE, f"{kind}:{key}"))


class SupabaseWriter:
    def __init__(self, url: str, key: str) -> None:
        self.base = f"{url.rstrip('/')}/rest/v1"
        self.headers = {
            "apikey": key,
            "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates",
        }
        if not key.startswith("sb_secret_"):
            self.headers["Authorization"] = f"Bearer {key}"

    def request(self, method: str, path: str, *, params: dict | None = None, payload=None) -> None:
        url = f"{self.base}/{path}"
        if params:
            url = f"{url}?{urlencode(params)}"
        body = json.dumps(payload).encode() if payload is not None else None
        with urlopen(Request(url, data=body, method=method, headers=self.headers), timeout=30):
            pass

    def upsert(self, table: str, rows: list[dict], on_conflict: str) -> None:
        self.request("POST", table, params={"on_conflict": on_conflict}, payload=rows)

    def patch(self, table: str, filters: dict[str, str], values: dict) -> None:
        self.request("PATCH", table, params=filters, payload=values)

    def rpc(self, function: str, payload: dict) -> None:
        self.request("POST", f"rpc/{function}", payload=payload)


def main() -> int:
    load_dotenv(BACKEND_DIR / ".env")
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        print(
            "SUPABASE_URL and SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) "
            "are required in backend/.env. "
            "Never put the service-role key in frontend environment files.", file=sys.stderr,
        )
        return 2

    seed = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    writer = SupabaseWriter(url, key)
    bank = seed["bank"]
    bank_id = stable_id("bank", bank["slug"])
    writer.upsert("question_banks", [{
        "id": bank_id, **bank, "status": "published",
    }], "slug")

    topic_ids = {topic["slug"]: stable_id("topic", topic["slug"]) for topic in seed["topics"]}
    for topic in seed["topics"]:
        writer.upsert("question_topics", [{
            "id": topic_ids[topic["slug"]], "bank_id": bank_id,
            "parent_id": topic_ids.get(topic.get("parent")), "slug": topic["slug"],
            "name": topic["name"], "display_order": topic["order"], "active": True,
        }], "bank_id,slug")

    provenance = seed["provenance"]
    for question in seed["questions"]:
        question_id = stable_id("question", question["slug"])
        version_id = stable_id("version", f"{question['slug']}:1")
        writer.upsert("dsa_questions", [{
            "id": question_id, "bank_id": bank_id, "slug": question["slug"],
            "status": "published",
        }], "bank_id,slug")
        writer.upsert("dsa_question_versions", [{
            "id": version_id, "question_id": question_id, "version": 1,
            "title": question["title"], "prompt": question["prompt"],
            "constraints": question["constraints"], "difficulty": question["difficulty"],
            "duration_seconds": question["duration_seconds"], "starter_code": question["starter_code"],
            "function_name": question["function_name"], "parameter_names": question["parameter_names"],
            "validator_key": question["validator_key"], "solution_outline": question["solution_outline"],
            "reference_solution": question["reference_solution"], "expected_time": question["expected_time"],
            "expected_space": question["expected_space"], "provenance_type": provenance["type"],
            "source_name": provenance["source_name"], "source_license": provenance["license"],
            "attribution": provenance["note"], "published_at": datetime.now(timezone.utc).isoformat(),
        }], "question_id,version")

        mappings = [{
            "question_id": question_id, "topic_id": topic_ids[tag["slug"]],
            "is_primary": tag.get("primary", False), "relevance_weight": 1,
        } for tag in question["topics"]]
        writer.upsert("dsa_question_topics", mappings, "question_id,topic_id")

        tests = []
        for order, row in enumerate(question["tests"]):
            case_key, label, args, expected, visibility = row
            tests.append({
                "id": stable_id("test", f"{question['slug']}:{case_key}"),
                "question_version_id": version_id, "case_key": case_key, "label": label,
                "input": {"args": args}, "expected": expected, "visibility": visibility,
                "display_order": order,
            })
        writer.upsert("dsa_test_cases", tests, "question_version_id,case_key")
        writer.upsert("dsa_followups", [{
            "id": stable_id("followup", question["slug"]), "question_version_id": version_id,
            "prompt": "Walk me through the time and space complexity of your approach. Which edge case was most important to handle?",
            "ideal_answer": f"A strong answer derives {question['expected_time']} time and {question['expected_space']} space, then connects an edge case to the submitted code.",
            "rubric": {"time": question["expected_time"], "space": question["expected_space"], "requires_edge_case": True},
            "trigger_key": "always", "active": True, "display_order": 0,
        }], "id")
        writer.rpc("validate_dsa_question_version", {"p_version_id": version_id})
        writer.patch("dsa_questions", {"id": f"eq.{question_id}"}, {"current_version_id": version_id})

    for blueprint in seed["blueprints"]:
        blueprint_id = stable_id("blueprint", f"{blueprint['slug']}:1")
        writer.upsert("assessment_blueprints", [{
            "id": blueprint_id, "bank_id": bank_id, "slug": blueprint["slug"],
            "name": blueprint["name"], "version": 1, "status": "published", "question_count": 1,
            "difficulty_min": blueprint["difficulty_min"], "difficulty_max": blueprint["difficulty_max"],
        }], "bank_id,slug,version")
        writer.upsert("assessment_blueprint_topics", [{
            "blueprint_id": blueprint_id, "topic_id": topic_ids[item["slug"]],
            "selection_scope": item["scope"], "weight": item["weight"],
        } for item in blueprint["topics"]], "blueprint_id,topic_id")

    print(f"Published {len(seed['questions'])} versioned questions to Supabase bank {bank['slug']}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
