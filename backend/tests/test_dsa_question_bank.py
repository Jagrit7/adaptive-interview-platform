"""Run from backend: python -m tests.test_dsa_question_bank"""

import os

os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_SECRET_KEY"] = ""
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = ""

from app.dsa.code_runner import run_candidate_code
from app.dsa.question_bank import QUESTION_BANK


for question in QUESTION_BANK.questions:
    result = run_candidate_code(
        question["reference_solution"], question["test_cases"],
        question["function_name"], question["parameter_names"], question["validator_key"],
    )
    assert result["passed"] == result["total"] == 8, (question["slug"], result)
    assert sum(case["visibility"] == "public" for case in question["test_cases"]) >= 5
    assert sum(case["visibility"] == "hidden" for case in question["test_cases"]) >= 3

catalog = QUESTION_BANK.catalog()
assert len(catalog["topics"]) >= 10
topic_slugs = [topic["slug"] for topic in catalog["topics"]]
assert len(topic_slugs) == len(set(topic_slugs)), "catalog topic slugs must be unique"

arrays, arrays_meta = QUESTION_BANK.select(
    session_id="same-seed", mode="topic_subtree", topic_slug="arrays",
    difficulty_min=1, difficulty_max=3,
)
arrays_again, _ = QUESTION_BANK.select(
    session_id="same-seed", mode="topic_subtree", topic_slug="arrays",
    difficulty_min=1, difficulty_max=3,
)
assert arrays["question_version_id"] == arrays_again["question_version_id"]
assert arrays_meta["selected_topic_slug"] == "arrays"
assert any(tag["slug"] in QUESTION_BANK.descendants("arrays") for tag in arrays["topics"])

fresh, fresh_meta = QUESTION_BANK.select(
    session_id="same-seed", mode="topic_subtree", topic_slug="arrays",
    recent_question_ids={str(arrays["question_id"])}, difficulty_min=1, difficulty_max=3,
)
assert fresh["question_id"] != arrays["question_id"]
assert fresh_meta["repeat_relaxed"] is False

blueprint, blueprint_meta = QUESTION_BANK.select(
    session_id="sde-seed", mode="blueprint", blueprint_slug="sde-core",
)
assert blueprint_meta["selected_topic_slug"]
assert blueprint["slug"]

print("DSA bank: all reference solutions pass; hierarchy and deterministic selection verified")
