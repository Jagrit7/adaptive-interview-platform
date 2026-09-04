"""Resolve per-interviewer bank references into a session-specific random order.

Saved panels store only ``bankId``. Hidden answers and executable DSA contracts
stay on the server and are copied into an in-memory session at start time.
"""

from __future__ import annotations

import hashlib
import random
from collections import deque
from typing import Any

from app.dsa.question_bank import QUESTION_BANK
from app.schemas.panel import KnowledgeItem, Panel
from app.orchestrator.conversation import question_allowed_for_agent


SYSTEM_DESIGN_SCENARIOS = [
    ("url-shortener", "a globally available URL shortener", "key generation, redirects, storage, caching, abuse prevention"),
    ("news-feed", "a personalized social news feed", "fan-out, ranking, pagination, celebrity traffic, consistency"),
    ("chat", "a real-time chat service", "WebSockets, ordering, offline delivery, presence, multi-device sync"),
    ("video-streaming", "a global video streaming platform", "upload pipeline, transcoding, CDN, manifests, observability"),
    ("ride-hailing", "a ride-hailing dispatch system", "geospatial indexing, matching, location streams, surge, failures"),
    ("food-delivery", "a food delivery marketplace", "order workflow, dispatch, inventory, tracking, compensation"),
    ("payments", "an online payment platform", "idempotency, ledgering, retries, reconciliation, fraud controls"),
    ("ticketing", "a high-demand event ticketing system", "virtual queues, reservations, overselling, payment expiry, fairness"),
    ("cloud-storage", "a Dropbox-like file storage service", "chunking, deduplication, metadata, sync, conflict resolution"),
    ("search", "a web-scale search service", "crawling, indexing, ranking, sharding, freshness"),
    ("metrics", "a high-cardinality metrics platform", "ingestion, aggregation, time-series storage, queries, retention"),
    ("logging", "a centralized log search platform", "agents, buffering, indexing, backpressure, tiered storage"),
    ("rate-limiter", "a distributed API rate limiter", "algorithms, atomicity, regional limits, clock skew, degradation"),
    ("notification", "a multi-channel notification service", "preferences, templates, queues, retries, deduplication"),
    ("scheduler", "a distributed job scheduler", "leases, retries, priorities, exactly-once effects, recovery"),
    ("collab-editor", "a collaborative document editor", "OT or CRDTs, presence, snapshots, offline edits, convergence"),
    ("ecommerce", "an e-commerce checkout system", "cart state, inventory reservation, payments, sagas, auditing"),
    ("ad-clicks", "an advertising click aggregation system", "high-volume ingestion, deduplication, windows, late events, fraud"),
    ("recommendations", "a product recommendation platform", "feature pipelines, candidate retrieval, ranking, freshness, experiments"),
    ("maps", "a maps and route-planning service", "map tiles, graph partitioning, shortest paths, traffic updates, caching"),
    ("email", "a large-scale email service", "mailbox storage, delivery queues, spam filtering, search, attachments"),
    ("calendar", "a shared calendar service", "recurrence, time zones, invitations, conflicts, reminders"),
    ("photo-sharing", "a photo sharing platform", "uploads, image processing, object storage, feeds, privacy"),
    ("feature-flags", "a low-latency feature flag service", "configuration distribution, targeting, caching, consistency, audit"),
    ("api-gateway", "a multi-tenant API gateway", "routing, authentication, quotas, transformations, observability"),
]

# Project-authored conceptual questions complement the executable catalog. A
# production Supabase catalog contributes 30 coding problems; the offline
# ten-problem seed contributes ten. Verbal items fill the remainder to exactly
# 50 so both environments exercise mixed interview formats.
DSA_VERBAL_QUESTIONS = [
    ("array-vs-linked", "Compare arrays and linked lists. When would you choose each?", "Arrays offer cache locality and O(1) indexing; linked lists offer cheap known-position insertion but pointer overhead and O(n) access."),
    ("dynamic-array", "How does a dynamic array grow, and why is append amortized O(1)?", "It grows geometrically and occasionally copies O(n) elements; geometric growth spreads that cost across many constant-time appends."),
    ("hash-collision", "How do hash tables handle collisions, and what makes performance degrade?", "Chaining or open addressing resolves collisions; poor hashing, high load, or adversarial keys can degrade expected O(1) operations toward O(n)."),
    ("hash-resize", "Explain load factor and resizing in a hash table.", "Load factor is entries versus capacity; crossing a threshold triggers allocation and rehashing to preserve expected constant-time operations."),
    ("stack-uses", "Give two problems naturally modeled by a stack and explain why.", "Examples include delimiter matching, DFS, undo, and expression evaluation because the most recently opened or added item is handled first."),
    ("queue-uses", "When is a queue the right abstraction, and how does a deque extend it?", "Queues provide FIFO scheduling and BFS order; deques add constant-time operations at both ends."),
    ("monotonic-stack", "What invariant does a monotonic stack maintain, and what problems does it solve?", "Elements remain increasing or decreasing; popped elements discover a next greater/smaller boundary, enabling linear-time span problems."),
    ("heap-vs-sort", "When would you use a heap instead of sorting the entire input?", "Use a heap for streaming priorities, repeated min/max removal, or top-k when k is much smaller than n; full sorting is useful when complete order is needed."),
    ("heap-complexity", "Why can a binary heap be built in O(n) even though insertion is O(log n)?", "Bottom-up heapify processes many low-height nodes and few high-height nodes; the weighted sum of sift-down work is linear."),
    ("bfs-vs-dfs", "Compare BFS and DFS and give a case where each is preferable.", "BFS finds shortest unweighted paths and explores by level; DFS is natural for reachability, backtracking, components, and dependency ordering."),
    ("visited-graph", "Why is a visited set essential in graph traversal?", "It prevents cycles and repeated expansion, keeping traversal O(V+E) and avoiding nontermination."),
    ("topological-sort", "What does a topological ordering represent, and when does it not exist?", "It orders a directed graph so prerequisites precede dependents; it exists only for DAGs and fails when a directed cycle exists."),
    ("dijkstra-limits", "When is Dijkstra's algorithm valid, and what breaks with negative edges?", "It requires nonnegative edge weights because settled distances must not later improve; negative edges invalidate that greedy invariant."),
    ("union-find", "Explain union-find and the effect of path compression and union by rank.", "It tracks disjoint components; both optimizations make a sequence of operations nearly constant amortized time, O(alpha(n))."),
    ("tree-traversals", "Contrast preorder, inorder, postorder, and level-order tree traversal.", "They place the root before, between, or after subtrees; level order uses BFS. Choice follows the required dependency or output order."),
    ("bst-invariant", "State the binary-search-tree invariant and its complexity assumptions.", "Left keys are smaller and right keys larger under the chosen duplicate policy; operations are O(height), average O(log n) but worst O(n) if skewed."),
    ("balanced-trees", "Why do AVL or red-black trees rebalance, and what guarantee do they provide?", "Rotations constrain height to O(log n), guaranteeing logarithmic search, insertion, and deletion."),
    ("trie-tradeoff", "What are the benefits and costs of a trie compared with a hash set of strings?", "A trie supports prefix operations in O(length) but often uses more memory; a hash set is compact and fast for exact membership but not prefix enumeration."),
    ("binary-search-invariant", "What loop invariant makes binary search correct?", "The target, if present, remains inside the maintained search interval; each comparison discards a proven-impossible half while preserving boundary semantics."),
    ("binary-search-answer", "What does 'binary search on the answer' mean?", "Search a monotonic feasibility boundary over candidate values; a predicate partitions impossible and possible answers."),
    ("stable-sort", "What is a stable sort, and when does stability matter?", "Equal-key items preserve their original relative order; it matters in multi-key sorting and when prior ordering carries meaning."),
    ("merge-vs-quick", "Compare merge sort and quicksort in time, space, and worst-case behavior.", "Merge sort guarantees O(n log n), is stable, and uses extra space; quicksort is often in-place and fast on average but can be O(n²) without robust pivots."),
    ("counting-sort", "When can counting sort beat comparison sorting?", "When keys lie in a manageable integer range, it runs O(n+k); memory and a large sparse range are its main costs."),
    ("two-pointers", "What properties let a two-pointer algorithm replace a nested loop?", "An ordering or monotonic relationship lets one pointer movement permanently eliminate candidates, often reducing O(n²) work to O(n)."),
    ("sliding-window", "Distinguish fixed and variable sliding windows.", "Fixed windows update a constant-width aggregate; variable windows expand and contract under a monotonic validity condition."),
    ("prefix-sum", "How do prefix sums trade preprocessing for query speed?", "O(n) preprocessing stores cumulative values so range sums are answered by subtracting two prefixes in O(1)."),
    ("difference-array", "What is a difference array useful for?", "It records range-boundary changes so many range updates are O(1) each, followed by one prefix reconstruction."),
    ("recursion-stack", "What causes recursion depth problems, and how can you remove them?", "Each call consumes stack space; deep or skewed inputs overflow. Replace recursion with an explicit stack or iterative state machine."),
    ("memoization-tabulation", "Compare memoization and tabulation in dynamic programming.", "Memoization is top-down and evaluates reachable states lazily; tabulation is bottom-up, avoids call overhead, and makes evaluation order explicit."),
    ("dp-state", "How do you design a useful dynamic-programming state?", "Choose the minimal information needed to define remaining choices, write the recurrence and base cases, then verify state count and transition cost."),
    ("greedy-proof", "How would you justify that a greedy choice is globally correct?", "Use an exchange argument, cut property, or stays-ahead invariant showing an optimal solution can adopt the local choice without becoming worse."),
    ("backtracking-pruning", "How does pruning improve backtracking without changing correctness?", "It stops branches proven unable to produce a valid or better solution; the proof must show no discarded branch can contain a needed answer."),
    ("bit-mask", "When is a bit mask an effective representation for a set?", "For a small bounded universe it packs membership compactly and enables constant-time set operations with bitwise operators."),
    ("overflow", "What integer-overflow issues should you consider in algorithm implementation?", "Intermediate arithmetic may exceed the type even when the final answer does not; widen types, reorder safe operations, or apply modular arithmetic correctly."),
    ("complexity-amortized", "What is amortized analysis, and how is it different from average-case analysis?", "Amortized analysis bounds total cost over any operation sequence without a probability distribution; average-case analysis assumes an input distribution."),
    ("space-complexity", "What should be included when reporting auxiliary space complexity?", "Count extra data structures and call stack, distinguish them from input/output storage, and state whether mutation is allowed."),
    ("lower-bound", "Why do comparison-based sorts have an Omega(n log n) lower bound?", "A decision tree must distinguish n! permutations; its height is at least log2(n!), which is Omega(n log n)."),
    ("cache-locality", "How can cache locality change the practical performance of two algorithms with the same Big-O?", "Contiguous predictable access uses cache lines and prefetching efficiently; pointer chasing and random access cause more latency despite equal asymptotic bounds."),
    ("edge-cases", "Describe a systematic way to identify edge cases before coding.", "Check empty/minimal inputs, duplicates, ordering, signs and zero, boundaries, overflow, invalid assumptions, and maximum-size behavior."),
    ("testing-algorithms", "How would you test an algorithm beyond a few examples?", "Combine boundary and adversarial cases, invariants, randomized/property tests, and differential checks against a simple reference implementation."),
]


def _dsa_verbal_items() -> list[KnowledgeItem]:
    return [KnowledgeItem(id=f"dsa-verbal-{slug}", question=question, idealAnswer=answer,
                          tags=["DSA", "Verbal"], difficulty=3, kind="verbal", domain="dsa")
            for slug, question, answer in DSA_VERBAL_QUESTIONS]


def _system_design_items() -> list[KnowledgeItem]:
    items: list[KnowledgeItem] = []
    for slug, product, concerns in SYSTEM_DESIGN_SCENARIOS:
        ideal = f"A strong answer covers requirements and scale, APIs, data model, components, then {concerns}, with explicit trade-offs."
        items.append(KnowledgeItem(
            id=f"sd-{slug}-verbal", kind="verbal", difficulty=3,
            question=f"How would you design {product}? Start with requirements and explain the most important architectural trade-offs.",
            idealAnswer=ideal, tags=["System design", "Verbal"],
            domain="system_design",
        ))
        items.append(KnowledgeItem(
            id=f"sd-{slug}-written", kind="written", difficulty=4,
            question=f"Create a concise architecture for {product}. In the writing pad include APIs, core data model, component/data flow, scaling plan, and failure handling.",
            idealAnswer=ideal, tags=["System design", "Written"],
            domain="system_design",
        ))
    return items


_RECENT_QUESTIONS: dict[str, deque[str]] = {}
_RECENT_WINDOW = 30

# Panels created before per-interviewer bank selection existed stored the four
# RecruitPro template prompts as a custom bank. Recognise that exact legacy
# technical subset so reopening an old test panel receives the current DSA
# runtime contracts instead of the same three non-executable writing prompts.
_LEGACY_FRONTEND_TECHNICAL_IDS = {
    "react-reconciliation",
    "frontend-state",
    "lru-cache",
}


def _recent_key(panel_name: str, agent_id: str) -> str:
    return f"{panel_name.strip().casefold()}|{agent_id}"


def remember_question(panel_name: str, agent_id: str, question_id: str) -> None:
    """Keep a bounded process-local history so a new attempt starts fresh."""
    key = _recent_key(panel_name, agent_id)
    history = _RECENT_QUESTIONS.setdefault(key, deque(maxlen=_RECENT_WINDOW))
    if question_id in history:
        history.remove(question_id)
    history.append(question_id)


def _stable_shuffle(items: list[KnowledgeItem], session_id: str, agent_id: str,
                    panel_name: str) -> list[KnowledgeItem]:
    # Mix session_id with current time so even rapid restarts produce different
    # orderings, preventing the "same questions every test" problem.
    import time
    entropy = f"{session_id}|{agent_id}|{time.time_ns()}"
    seed = int(hashlib.sha256(entropy.encode()).hexdigest(), 16)
    shuffled = list(items)
    random.Random(seed).shuffle(shuffled)
    recent = set(_RECENT_QUESTIONS.get(_recent_key(panel_name, agent_id), ()))
    # Preserve random order inside each group, but exhaust unseen questions
    # before allowing a recently used one to return.
    return [item for item in shuffled if item.id not in recent] + [
        item for item in shuffled if item.id in recent
    ]


def hydrate_panel_banks(panel: Panel, session_id: str) -> tuple[Panel, dict[str, dict[str, Any]]]:
    """Hydrate bank references and return private coding contracts by item id."""
    hydrated = panel.model_copy(deep=True)
    coding_contracts: dict[str, dict[str, Any]] = {}
    for agent in hydrated.agents:
        bank_id = agent.knowledge.bankId
        item_ids = {item.id for item in agent.knowledge.items}
        legacy_frontend_technical = (
            agent.identity.role == "Technical"
            and _LEGACY_FRONTEND_TECHNICAL_IDS.issubset(item_ids)
        )
        if bank_id == "dsa" or legacy_frontend_technical:
            agent.knowledge.bankId = "dsa"
            coding_items: list[KnowledgeItem] = []
            for question in QUESTION_BANK.questions[:30]:
                item_id = str(question["question_id"])
                coding_items.append(KnowledgeItem(
                    id=item_id, question=question["prompt"],
                    idealAnswer=(f"{question.get('solution_outline', '')} Expected time "
                                 f"{question.get('expected_time', '')}; space {question.get('expected_space', '')}."),
                    tags=[tag["slug"] for tag in question.get("topics", [])] + ["Coding"],
                    difficulty=int(question["difficulty"]), kind="coding",
                    domain="dsa",
                ))
                coding_contracts[item_id] = question
            verbal_needed = max(0, 50 - len(coding_items))
            source = coding_items + _dsa_verbal_items()[:verbal_needed]
            agent.knowledge.items = _stable_shuffle(source, session_id, agent.id, hydrated.projectName)
            agent.knowledge.mode = "knowledge_base"
            agent.knowledge.strict = True
            agent.knowledge.sourceName = "DSA Core (Supabase runtime)"
        elif bank_id == "system-design":
            agent.knowledge.items = _stable_shuffle(_system_design_items(), session_id, agent.id, hydrated.projectName)
            agent.knowledge.mode = "knowledge_base"
            agent.knowledge.strict = True
            agent.knowledge.sourceName = "System Design Core 50"
        elif agent.knowledge.mode == "knowledge_base":
            # Old RecruitPro saves copied the same mixed custom bank into every
            # interviewer. Apply the current specialist boundary while hydrating
            # so HR cannot receive a coding prompt and technical agents cannot
            # wander into behavioural questions.
            compatible = [item for item in agent.knowledge.items if question_allowed_for_agent(agent, item)]
            agent.knowledge.items = _stable_shuffle(compatible, session_id, agent.id, hydrated.projectName)
    return hydrated, coding_contracts
