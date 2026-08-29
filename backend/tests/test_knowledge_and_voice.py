"""Run from the backend folder:   python -m tests.test_knowledge_and_voice
Paths are resolved relative to this file, so it works wherever the repo lives."""
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent          # .../backend
PROJECT = BACKEND.parent                                   # .../adaptive-interview-platform
sys.path.insert(0, str(BACKEND))

from app.knowledge.store import (
    KnowledgeParseError, parse_upload, retrieve, pick_next_question,
    find_reference_answer, format_knowledge_block,
)
from app.schemas.panel import Knowledge, Panel, Agent
from app.config.voice_profiles import (
    assign_voices, build_stt, build_tts, get_profile, list_languages, LANGUAGES,
)

ok = lambda label: print(f"  PASS  {label}")

print("\n=== 1. CSV with headers, quoted fields, embedded commas ===")
csv = (
    'question,ideal answer,tags,difficulty\n'
    '"Explain a hash map, including collisions.","Key-value store, O(1) average; chaining or open addressing.",ds;algo,4\n'
    '"What is a deadlock?","Four Coffman conditions: mutual exclusion, hold and wait, no preemption, circular wait.",os,6\n'
)
items = parse_upload("bank.csv", csv.encode())
assert len(items) == 2, items
assert items[0].question.startswith("Explain a hash map, including collisions")
assert items[0].tags == ["ds", "algo"], items[0].tags
assert items[0].difficulty == 4
assert "Coffman" in items[1].idealAnswer
ok(f"{len(items)} items, comma inside quotes survived, tags split, difficulty coerced")

print("\n=== 2. Header alias tolerance (Q / Model Answer / Topic) ===")
csv2 = 'Q,Model Answer,Topic\nWhat is a B-tree?,Balanced n-ary tree used by DB indexes.,databases\n'
items2 = parse_upload("aliases.csv", csv2.encode())
assert items2[0].question == "What is a B-tree?"
assert items2[0].idealAnswer.startswith("Balanced n-ary")
assert items2[0].tags == ["databases"]
ok("fuzzy header matching works")

print("\n=== 3. Headerless CSV falls back to positional ===")
items3 = parse_upload("nohdr.csv", b"What is TCP?,Reliable ordered byte stream.\nWhat is UDP?,Datagram best effort.\n")
assert len(items3) == 2 and items3[1].idealAnswer == "Datagram best effort."
ok("positional fallback works")

print("\n=== 4. JSON array, JSON wrapped in {items:[]}, and JSONL ===")
j1 = parse_upload("a.json", b'[{"question":"Q1","answer":"A1"},{"question":"Q2"}]')
j2 = parse_upload("b.json", b'{"items":[{"prompt":"Q3","expectedAnswer":"A3","tags":["x","y"]}]}')
j3 = parse_upload("c.jsonl", b'{"question":"Q4","answer":"A4"}\n\n{"q":"Q5","a":"A5"}\n')
assert [i.question for i in j1] == ["Q1", "Q2"]
assert j2[0].idealAnswer == "A3" and j2[0].tags == ["x", "y"]
assert [i.question for i in j3] == ["Q4", "Q5"]
ok("all three JSON shapes parse")

print("\n=== 5. Markdown Q:/A: blocks and a bare question list ===")
md = """# Backend round

Q: How would you design a rate limiter?
A: Token bucket or sliding window; discuss distributed state in Redis.

**Q**: Why is idempotency important for payment APIs?
**A**: Retries must not double-charge; use an idempotency key.
"""
m1 = parse_upload("bank.md", md.encode())
assert len(m1) == 2, [i.question for i in m1]
assert "Token bucket" in m1[0].idealAnswer
assert m1[1].question.startswith("Why is idempotency")
m2 = parse_upload("plain.txt", b"- Tell me about a conflict you resolved.\n1. Describe a failure you owned.\n\n# heading ignored\n")
assert len(m2) == 2 and m2[0].question == "Tell me about a conflict you resolved."
ok("Q/A blocks + bullet/numbered list stripping both work")

print("\n=== 6. Duplicate collapsing and error messages ===")
dup = parse_upload("d.csv", b"question\nWhat is a mutex?\n  what is a MUTEX?  \nWhat is a semaphore?\n")
assert len(dup) == 2, [i.question for i in dup]
ok("case/whitespace duplicates collapsed")

for bad, label in [
    (("x.pdf", b"%PDF-1.4"), "unsupported extension"),
    (("x.csv", b""), "empty file"),
    (("x.json", b"{not json"), "malformed JSON"),
]:
    try:
        parse_upload(*bad)
        raise AssertionError(f"{label} should have raised")
    except KnowledgeParseError as e:
        assert len(str(e)) > 15, str(e)
ok("all three failure modes raise a readable KnowledgeParseError")

print("\n=== 7. IDs are unique (they key asked/pending tracking) ===")
big = parse_upload("many.csv", ("question\n" + "\n".join(f"Question number {n}" for n in range(200))).encode())
assert len({i.id for i in big}) == len(big) == 200
ok("200 unique ids")

print("\n=== 8. Retrieval picks the right reference answer ===")
bank = parse_upload("r.csv", (
    "question,answer\n"
    "How does TCP guarantee ordering?,Sequence numbers and receiver-side reassembly with ACKs.\n"
    "What is database sharding?,Horizontal partitioning of rows across nodes by a shard key.\n"
    "Explain CSS specificity.,Inline > id > class > element; later rules win ties.\n"
).encode())
top = retrieve(bank, "you split the rows across several nodes using a partition key", k=1)
assert "sharding" in top[0].question.lower(), top[0].question
top2 = retrieve(bank, "the receiver reassembles packets using sequence numbers", k=1)
assert "TCP" in top2[0].question, top2[0].question
assert retrieve(bank, "", k=1) == [] and retrieve([], "anything", k=1) == []
ok("retrieval matched paraphrased answers to the right question; empty inputs safe")

print("\n=== 9. asked_id beats retrieval (grading the question actually asked) ===")
ref = find_reference_answer(bank, bank[2].id, "sequence numbers and acks")
assert ref.id == bank[2].id, "explicit asked_item_id must win over lexical similarity"
ok("pending question takes precedence over fuzzy match")

print("\n=== 10. pick_next_question respects upload order and never repeats ===")
asked = set()
seen = []
while (nxt := pick_next_question(bank, asked)) is not None:
    seen.append(nxt.question)
    asked.add(nxt.id)
assert seen == [i.question for i in bank], seen
assert pick_next_question(bank, asked) is None
ok("walked the bank in order, then returned None when exhausted")

print("\n=== 11. Prompt block: strict vs guided, and answer-leak guard ===")
strict = format_knowledge_block(Knowledge(mode="knowledge_base", strict=True, items=bank))
guided = format_knowledge_block(Knowledge(mode="knowledge_base", strict=False, items=bank))
assert "ONLY questions from the list" in strict
assert "Work through the questions below first" in guided
assert "Never read out, quote, or hint at the expected answers" in strict
assert format_knowledge_block(Knowledge(mode="llm", items=bank)) == ""
assert format_knowledge_block(Knowledge(mode="knowledge_base", items=[])) == ""
ok("strict/guided wording differs, leak guard present, llm mode emits nothing")

truncated = format_knowledge_block(Knowledge(mode="knowledge_base", items=big), max_items=40)
assert "and 160 more" in truncated
ok("oversized bank truncates with a count instead of flooding the prompt")

print("\n=== 12. Voice registry ===")
codes = [p.code for p in LANGUAGES]
assert len(codes) == len(set(codes))
for p in LANGUAGES:
    assert p.voices, p.code
    assert len({v.id for v in p.voices}) == len(p.voices), f"dup voice in {p.code}"
ok(f"{len(LANGUAGES)} languages, no duplicate codes or voices")

assert get_profile("de-DE").code == "de-DE"
assert get_profile("klingon").code == "en-US"
assert get_profile(None).code == "en-US"
ok("unknown/None language falls back to default instead of raising")

v = assign_voices(["a", "b", "c", "d", "e", "f", "g"], "en-US")
first_six = [v[k] for k in ["a", "b", "c", "d", "e", "f"]]
assert len(set(first_six)) == 6, first_six
assert v["g"] == v["a"], "should wrap around, not crash"
assert assign_voices(["a", "b", "c"], "en-US") == {k: v[k] for k in ["a", "b", "c"]}
ok("distinct voices per agent, deterministic, wraps past pool size")

single = assign_voices(["a", "b"], "vi-VN")   # pool of 1
assert single["a"] == single["b"]
ok("single-voice language degrades gracefully")

print("\n=== 13. SDK objects actually construct (managed/keyless path) ===")
for code in ["en-US", "hi-IN", "ja-JP", "zh-CN"]:
    stt = build_stt(code)
    tts = build_tts(code, assign_voices(["x"], code)["x"])
    sc, tc = stt.to_config(), tts.to_config()
    assert sc["vendor"] == "deepgram" and "key" not in sc["params"], sc
    assert tc["vendor"] == "minimax" and "key" not in tc["params"], tc
    assert tc["params"]["voice_setting"]["voice_id"]
ok("DeepgramSTT + MiniMaxTTS build with no vendor API key for every language sampled")

zh = build_tts("zh-CN").to_config()
assert zh["params"]["language_boost"] == "Chinese"
assert zh["_minimax_preset_model"] == "speech-2.6-turbo"
ok("language_boost applied and the Agora-managed preset path is taken")

print("\n=== 14. Old saved panels still validate ===")
legacy_agent = {
    "id": "tech-1",
    "identity": {"name": "Ada", "role": "Technical", "color": "#fff", "avatar": ""},
    "voice": {"provider": "elevenlabs", "voiceId": "default", "language": "en-US",
              "speakingStyle": "professional"},
    "behavior": {"systemPrompt": "p", "greetingMessage": "g", "fallbackMessage": "f",
                 "scenarioBrief": ""},
    "logic": {"difficultyBand": [3, 7], "seedQuestions": [], "followUpAggressiveness": 5,
              "maxTurns": 5, "maxVisits": 3},
    "skills": {"rolePlayMode": False, "loopUntilSatisfied": True, "contradictionProbing": False},
    "tools": [],
    "turnTaking": {"canOpen": True, "handoffTriggers": "", "priority": "high"},
    "scoring": {"competencies": ["System Design"]},
}
p = Panel(projectName="Legacy", agents=[legacy_agent], scorer={"competencies": []})
assert p.language == "en-US", "missing language must default"
assert p.agents[0].knowledge.mode == "llm" and not p.agents[0].knowledge.is_active()
ok("panel saved before this change validates; knowledge defaults to llm mode")

new_panel = Panel(projectName="New", language="ja-JP", agents=[{
    **legacy_agent,
    "knowledge": {"mode": "knowledge_base", "strict": True, "sourceName": "bank.csv",
                  "items": [i.model_dump() for i in bank]},
}])
assert new_panel.agents[0].knowledge.is_active()
assert new_panel.agents[0].knowledge.items[0].idealAnswer
ok("knowledge-base panel round-trips through the schema")

print("\nAll checks passed.\n")
