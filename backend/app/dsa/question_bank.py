"""Hierarchical DSA catalog and controlled question selection.

The checked-in JSON is the development/editorial source. When Supabase server
credentials are configured, published runtime rows are loaded from Supabase;
hidden fields are retained only inside FastAPI.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


DATA_PATH = Path(__file__).parents[2] / "data" / "dsa_question_bank.json"
DEFAULT_FOLLOWUP = (
    "Walk me through the time and space complexity of your approach. "
    "Which edge case was most important to handle?"
)

# Follow-ups keyed by what the candidate actually submitted.
#
# `trigger_key` has been on both the bank rows and the Supabase `dsa_followups`
# table since the beginning, but nothing ever read it: every candidate got the
# "always" prompt, chosen before they had typed a character. Asking someone to
# analyse the complexity of an empty submission is the visible symptom - it
# reads as an interviewer who was not paying attention, because it is.
#
# Ordered most to least specific; the resolver takes the first matching key the
# question offers, and falls back to these when a question supplies none.
DEFAULT_FOLLOWUPS_BY_TRIGGER = {
    "gave_up": (
        "No problem at all - not knowing one is part of the process. "
        "Let's leave that there and move on."
    ),
    "no_code": (
        "You didn't get code down this time, which is completely fine - talk me through it instead. "
        "How would you have approached the problem, and where did you get stuck?"
    ),
    "none_passed": (
        "None of the test cases passed, so let's talk through the thinking rather than the code. "
        "What approach were you going for, and where do you think it went wrong?"
    ),
    "partial": (
        "Some cases passed and some didn't. Which inputs do you think your solution mishandles, "
        "and what would you change to fix them?"
    ),
    "all_passed": (
        "All the tests passed. Walk me through the time and space complexity of your approach, "
        "and tell me whether you could do better."
    ),
    "always": DEFAULT_FOLLOWUP,
}


def _request_json(
    method: str, url: str, key: str, *, bearer: str | None = None,
    params: dict[str, Any] | None = None, payload: Any = None,
) -> Any:
    if params:
        url = f"{url}?{urlencode(params)}"
    body = json.dumps(payload).encode() if payload is not None else None
    headers = {
        "apikey": key, "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    if bearer:
        headers["Authorization"] = bearer
    elif not key.startswith("sb_secret_"):
        # Legacy service_role keys are JWTs; new secret keys belong only in
        # `apikey` and must not be presented as a bearer JWT.
        headers["Authorization"] = f"Bearer {key}"
    request = Request(url, data=body, method=method, headers=headers)
    with urlopen(request, timeout=10) as response:
        content = response.read()
        return json.loads(content) if content else None


def _stable_number(*parts: str) -> int:
    return int(hashlib.sha256("|".join(parts).encode()).hexdigest(), 16)


def _normalise_local_question(raw: dict[str, Any]) -> dict[str, Any]:
    question = dict(raw)
    cases = []
    for order, row in enumerate(raw["tests"]):
        case_key, label, args, expected, visibility = row
        cases.append({
            "id": case_key,
            "case_key": case_key,
            "label": label,
            "input": {"args": args},
            "expected": expected,
            "visibility": visibility,
            "display_order": order,
        })
    question.pop("tests", None)
    question.update({
        "id": raw["slug"],
        "question_id": raw["slug"],
        "question_version_id": f"{raw['slug']}:1",
        "version": 1,
        "language": "python",
        "starter_code": raw["starter_code"]["python"],
        "test_cases": cases,
        "followups": [
            {"prompt": prompt, "trigger_key": key}
            for key, prompt in DEFAULT_FOLLOWUPS_BY_TRIGGER.items()
        ],
        "provenance_type": "original",
        "source_name": "Adaptive Interview Platform editorial",
        "source_license": "Project-owned content",
        "exposure_count": 0,
    })
    return question


class QuestionBank:
    def __init__(self) -> None:
        self.seed = json.loads(DATA_PATH.read_text(encoding="utf-8"))
        self.questions = self._load_questions()
        self.topic_by_slug = {item["slug"]: item for item in self.seed["topics"]}

    @property
    def _supabase(self) -> tuple[str, str] | None:
        url = os.getenv("SUPABASE_URL", "").rstrip("/")
        key = os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        return (url, key) if url and key else None

    def user_id_from_token(self, authorization: str | None) -> str | None:
        if not self._supabase:
            return None
        if not authorization or not authorization.lower().startswith("bearer "):
            raise ValueError("Sign in before starting an interview")
        url, key = self._supabase
        try:
            return _request_json("GET", f"{url}/auth/v1/user", key, bearer=authorization).get("id")
        except HTTPError as exc:
            if exc.code == 401:
                raise ValueError("Your sign-in session is no longer valid") from exc
            raise

    def recent_question_ids(self, user_id: str | None, limit: int = 20) -> set[str]:
        if not user_id or not self._supabase:
            return set()
        url, key = self._supabase
        rows = _request_json("GET", f"{url}/rest/v1/dsa_attempts", key, params={
            "select": "question_id", "user_id": f"eq.{user_id}",
            "order": "selected_at.desc", "limit": limit,
        })
        return {str(row["question_id"]) for row in rows}

    def record_attempt(
        self, *, session_id: str, user_id: str | None, question: dict[str, Any],
        metadata: dict[str, Any], bank_slug: str = "dsa-core",
    ) -> None:
        if not self._supabase or str(question["question_id"]) == question.get("slug"):
            return
        url, key = self._supabase
        payload = {
            "session_id": session_id, "user_id": user_id,
            "question_id": question["question_id"], "question_version_id": question["question_version_id"],
            "selection_mode": metadata["mode"], "bank_slug": bank_slug,
            "requested_topic_slug": metadata.get("requested_topic_slug"),
            "selected_topic_slug": metadata.get("selected_topic_slug"),
            "blueprint_slug": metadata.get("blueprint_slug"),
            "selection_seed": metadata["selection_seed"], "repeat_relaxed": metadata["repeat_relaxed"],
            "started_at": None,
        }
        _request_json("POST", f"{url}/rest/v1/dsa_attempts", key,
                      params={"on_conflict": "session_id"}, payload=payload)

    def update_attempt(self, session_id: str, values: dict[str, Any]) -> None:
        if not self._supabase:
            return
        url, key = self._supabase
        _request_json("PATCH", f"{url}/rest/v1/dsa_attempts", key,
                      params={"session_id": f"eq.{session_id}"}, payload=values)

    def _load_questions(self) -> list[dict[str, Any]]:
        url = os.getenv("SUPABASE_URL", "").rstrip("/")
        key = os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        if url and key:
            try:
                rows = _request_json(
                    "GET", f"{url}/rest/v1/dsa_question_runtime", key,
                    params={"select": "*", "bank_slug": "eq.dsa-core"},
                )
                if rows:
                    return [self._normalise_remote(row) for row in rows]
            except Exception as exc:
                print(f"[dsa bank] Supabase unavailable; using checked-in bank: {exc}")
        return [_normalise_local_question(item) for item in self.seed["questions"]]

    @staticmethod
    def _normalise_remote(row: dict[str, Any]) -> dict[str, Any]:
        item = dict(row)
        starters = item.get("starter_code", {})
        item["id"] = item["question_id"]
        item["language"] = "python"
        item["starter_code"] = starters.get("python", "")
        return item

    def catalog(self) -> dict[str, Any]:
        # A topic slug is its stable public identity. Keep the runtime response
        # safe even if an editorial seed accidentally repeats a row: React uses
        # this slug as its list key and the selector also indexes by slug.
        topics_by_slug: dict[str, dict[str, Any]] = {}
        for item in self.seed["topics"]:
            topics_by_slug.setdefault(item["slug"], dict(item))
        topics = list(topics_by_slug.values())
        for topic in topics:
            scope = self.descendants(topic["slug"])
            topic["question_count"] = sum(
                any(tag["slug"] in scope for tag in question["topics"])
                for question in self.questions
            )
        return {
            "bank": self.seed["bank"],
            "topics": topics,
            "blueprints": self.seed["blueprints"],
            "source": "supabase" if self._supabase else "local_seed",
        }

    def descendants(self, topic_slug: str) -> set[str]:
        found = {topic_slug}
        changed = True
        while changed:
            changed = False
            for topic in self.seed["topics"]:
                if topic.get("parent") in found and topic["slug"] not in found:
                    found.add(topic["slug"])
                    changed = True
        return found

    def _blueprint_topic(self, blueprint_slug: str, seed: str) -> str:
        blueprint = next(
            (item for item in self.seed["blueprints"] if item["slug"] == blueprint_slug), None,
        )
        if not blueprint:
            raise ValueError(f"Unknown assessment blueprint: {blueprint_slug}")
        slots = [
            topic["slug"]
            for topic in blueprint["topics"]
            for _ in range(int(topic["weight"]))
        ]
        return slots[_stable_number(seed, blueprint_slug) % len(slots)]

    def select(
        self, *, session_id: str, mode: str = "bank", topic_slug: str | None = None,
        blueprint_slug: str | None = None, difficulty_min: int = 1,
        difficulty_max: int = 3, recent_question_ids: set[str] | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        selected_topic = topic_slug
        if mode == "blueprint":
            selected_topic = self._blueprint_topic(blueprint_slug or "sde-core", session_id)
            allowed_topics = self.descendants(selected_topic)
        elif mode == "topic_subtree":
            if not topic_slug or topic_slug not in self.topic_by_slug:
                raise ValueError("A valid topic is required for topic practice")
            allowed_topics = self.descendants(topic_slug)
        elif mode == "topic_exact":
            if not topic_slug or topic_slug not in self.topic_by_slug:
                raise ValueError("A valid topic is required for topic practice")
            allowed_topics = {topic_slug}
        elif mode == "bank":
            allowed_topics = set(self.topic_by_slug)
        else:
            raise ValueError(f"Unsupported selection mode: {mode}")

        candidates = [
            item for item in self.questions
            if difficulty_min <= int(item["difficulty"]) <= difficulty_max
            and any(tag["slug"] in allowed_topics for tag in item["topics"])
        ]
        if not candidates:
            raise ValueError("No published questions match this scope and difficulty")

        recent = recent_question_ids or set()
        fresh = [item for item in candidates if str(item["question_id"]) not in recent]
        repeat_relaxed = not fresh
        pool = fresh or candidates
        pool.sort(key=lambda item: (
            int(item.get("exposure_count", 0)),
            _stable_number(session_id, str(item["question_version_id"])),
        ))
        selected = pool[0]
        metadata = {
            "mode": mode, "requested_topic_slug": topic_slug,
            "selected_topic_slug": selected_topic,
            "blueprint_slug": blueprint_slug,
            "repeat_relaxed": repeat_relaxed,
            "selection_seed": session_id,
        }
        return selected, metadata


def public_question(question: dict[str, Any]) -> dict[str, Any]:
    public_cases = [case for case in question["test_cases"] if case["visibility"] == "public"]
    return {
        "id": str(question["question_id"]), "slug": question["slug"],
        "version_id": str(question["question_version_id"]), "title": question["title"],
        "prompt": question["prompt"], "difficulty": int(question["difficulty"]),
        "duration_seconds": int(question["duration_seconds"]), "language": "python",
        "starter_code": question["starter_code"], "constraints": question["constraints"],
        "topics": question["topics"],
        "test_cases": [{
            "id": str(case["id"]), "label": case["label"],
            "input_display": repr(case["input"]["args"]),
            "expected_display": repr(case["expected"]),
        } for case in public_cases],
    }


QUESTION_BANK = QuestionBank()
