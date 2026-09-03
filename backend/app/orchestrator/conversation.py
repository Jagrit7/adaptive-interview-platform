"""Configuration-driven conversation policy for enterprise interviews.

This module contains no HTTP or Agora code.  It converts a panel's agent
configuration into isolated specialist profiles and produces the one command
that the active voice session may speak.  Keeping these decisions here stops
routes, UI components and LLM prompts from independently inventing flow rules.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

import re

from app.schemas.panel import Agent, KnowledgeItem, Panel, QuestionDomain, QuestionKind


class SpecialistDomain(str, Enum):
    DSA = "dsa"
    SYSTEM_DESIGN = "system_design"
    BEHAVIOURAL = "behavioural"
    PRODUCT = "product"
    CUSTOMER = "customer"
    TECHNICAL = "technical"
    CUSTOM = "custom"


@dataclass(frozen=True)
class SpecialistProfile:
    agent_id: str
    name: str
    domain: SpecialistDomain
    voice_id: str
    allowed_question_kinds: frozenset[QuestionKind]
    allowed_question_domains: frozenset[QuestionDomain]
    boundary_instruction: str


_ROLE_DOMAINS = {
    "Behavioural": SpecialistDomain.BEHAVIOURAL,
    "Hiring manager": SpecialistDomain.BEHAVIOURAL,
    "Product": SpecialistDomain.PRODUCT,
    "Customer": SpecialistDomain.CUSTOMER,
}

_BOUNDARIES = {
    SpecialistDomain.DSA: (
        "You are the DSA specialist. Discuss algorithms, data structures, code correctness, "
        "complexity and edge cases only. Do not ask HR, product or system-design questions."
    ),
    SpecialistDomain.SYSTEM_DESIGN: (
        "You are the system-design specialist. Discuss requirements, APIs, data models, "
        "architecture, scale, reliability and trade-offs only. Do not ask coding or HR questions."
    ),
    SpecialistDomain.BEHAVIOURAL: (
        "You are the HR and communication specialist. Ask only behavioural, collaboration, "
        "leadership and communication questions. Never ask coding, algorithms or system design."
    ),
    SpecialistDomain.PRODUCT: (
        "You are the product specialist. Ask only product judgement, prioritisation, metrics, "
        "execution and collaboration questions. Do not ask coding questions."
    ),
    SpecialistDomain.CUSTOMER: (
        "You are the customer-role specialist. Stay within the configured customer scenario "
        "and evaluate empathy, discovery and communication. Do not ask unrelated technical questions."
    ),
    SpecialistDomain.TECHNICAL: (
        "You are a technical specialist. Ask only engineering, programming and architecture questions "
        "from your assigned bank. Do not ask behavioural, culture-fit or HR questions."
    ),
    SpecialistDomain.CUSTOM: (
        "Stay strictly inside this interviewer's configured scenario and assigned question bank. "
        "Do not take over another panel member's specialty."
    ),
}

_KINDS = {
    SpecialistDomain.DSA: frozenset({"coding", "verbal"}),
    SpecialistDomain.SYSTEM_DESIGN: frozenset({"written", "verbal"}),
    SpecialistDomain.BEHAVIOURAL: frozenset({"verbal"}),
    SpecialistDomain.PRODUCT: frozenset({"written", "verbal"}),
    SpecialistDomain.CUSTOMER: frozenset({"verbal"}),
    SpecialistDomain.TECHNICAL: frozenset({"coding", "written", "verbal"}),
    SpecialistDomain.CUSTOM: frozenset({"coding", "written", "verbal"}),
}

_DOMAINS: dict[SpecialistDomain, frozenset[QuestionDomain]] = {
    SpecialistDomain.DSA: frozenset({"dsa"}),
    SpecialistDomain.SYSTEM_DESIGN: frozenset({"system_design"}),
    SpecialistDomain.BEHAVIOURAL: frozenset({"behavioural"}),
    SpecialistDomain.PRODUCT: frozenset({"product", "behavioural", "general"}),
    SpecialistDomain.CUSTOMER: frozenset({"customer", "general"}),
    SpecialistDomain.TECHNICAL: frozenset({"dsa", "system_design", "general"}),
    SpecialistDomain.CUSTOM: frozenset({"dsa", "system_design", "behavioural", "product", "customer", "general"}),
}

_DOMAIN_MARKERS: tuple[tuple[QuestionDomain, re.Pattern[str]], ...] = (
    ("behavioural", re.compile(r"\b(behavio(?:u)?ral|tell me about|describe a time|conflict|collaboration|leadership|ownership|mistake|feedback|team fit|culture fit)\b", re.I)),
    ("system_design", re.compile(r"\b(system design|architecture|scalab|distributed system|design (?:a|an|the)|data model|availability|reliability)\b", re.I)),
    ("dsa", re.compile(r"\b(dsa|algorithm|data structure|complexity|array|linked list|stack|queue|tree|graph|dynamic programming|binary search|implement)\b", re.I)),
    ("product", re.compile(r"\b(product sense|prioriti[sz]|roadmap|product metric|user retention|go.to.market)\b", re.I)),
    ("customer", re.compile(r"\b(customer|client|objection|discovery call|stakeholder need)\b", re.I)),
)


def specialist_domain(agent: Agent) -> SpecialistDomain:
    # A declared people/behavioural role is a hard safety boundary. Selecting a
    # technical bank cannot silently turn the HR interviewer into an engineer.
    if agent.identity.role in {"Behavioural", "Hiring manager"}:
        return SpecialistDomain.BEHAVIOURAL
    if agent.knowledge.bankId == "dsa":
        return SpecialistDomain.DSA
    if agent.knowledge.bankId == "system-design":
        return SpecialistDomain.SYSTEM_DESIGN
    if agent.identity.role == "Technical":
        return SpecialistDomain.TECHNICAL
    return _ROLE_DOMAINS.get(agent.identity.role, SpecialistDomain.CUSTOM)


def allowed_question_kinds(agent: Agent) -> frozenset[QuestionKind]:
    return _KINDS[specialist_domain(agent)]


def question_domain(item: KnowledgeItem) -> QuestionDomain:
    if item.domain:
        return item.domain
    searchable = " ".join([*item.tags, item.question])
    for domain, pattern in _DOMAIN_MARKERS:
        if pattern.search(searchable):
            return domain
    return "general"


def question_allowed_for_agent(agent: Agent, item: KnowledgeItem) -> bool:
    domain = specialist_domain(agent)
    return (
        (item.kind or "verbal") in _KINDS[domain]
        and question_domain(item) in _DOMAINS[domain]
    )


def build_specialist_profiles(panel: Panel, voices: dict[str, str]) -> dict[str, SpecialistProfile]:
    profiles = {
        agent.id: SpecialistProfile(
            agent_id=agent.id,
            name=agent.identity.name,
            domain=domain,
            voice_id=voices[agent.id],
            allowed_question_kinds=_KINDS[domain],
            allowed_question_domains=_DOMAINS[domain],
            boundary_instruction=_BOUNDARIES[domain],
        )
        for agent in panel.agents
        for domain in [specialist_domain(agent)]
    }
    for agent in panel.agents:
        domain = profiles[agent.id].domain
        if domain == SpecialistDomain.BEHAVIOURAL and agent.knowledge.bankId in {"dsa", "system-design"}:
            raise ValueError(
                f"{agent.identity.name} is an HR/behavioural interviewer and cannot use the "
                f"{agent.knowledge.bankId} technical question bank."
            )
    return profiles


def validate_specialist_question(profile: SpecialistProfile, item: KnowledgeItem) -> None:
    kind: QuestionKind = item.kind or "verbal"
    if kind not in profile.allowed_question_kinds:
        raise ValueError(
            f"{profile.name} is configured as {profile.domain.value}, so a {kind} question "
            "cannot be assigned to that interviewer."
        )
    domain = question_domain(item)
    if domain not in profile.allowed_question_domains:
        raise ValueError(
            f"{profile.name} is configured as {profile.domain.value}, so a {domain} question "
            "cannot be assigned to that interviewer."
        )


def private_transcript(agent_id: str, transcript: list) -> str:
    """Only expose a specialist's own previous turns to its evaluator."""
    return "\n".join(
        f"{turn.speaker}: {turn.text}"
        for turn in transcript
        if turn.agent_id == agent_id
    )


def question_command(
    *,
    profile: SpecialistProfile,
    item: KnowledgeItem,
    kind: QuestionKind,
    language_suffix: str,
    opening: bool,
    introducing: bool,
    candidate_name: str,
    acknowledgement: str = "",
) -> str:
    """Create one atomic, role-bounded speaking instruction."""
    opening_line = (
        f"Greet {candidate_name or 'the candidate'} briefly, introduce yourself as "
        f"{profile.name}, then "
        if opening
        else (
            f"Introduce yourself as {profile.name} in one short sentence, then "
            if introducing
            else (f"{acknowledgement.strip()} Then " if acknowledgement else "")
        )
    )
    boundary = f"ROLE BOUNDARY: {profile.boundary_instruction}"
    if kind == "verbal":
        delivery = (
            f"{opening_line}ask exactly the following question once, naturally. After asking, stop "
            "speaking and wait for the complete candidate answer. Do not answer your own question, "
            "grade aloud, or introduce another question."
            f"{language_suffix}\n\nQuestion:\n{item.question}"
        )
    else:
        delivery = (
            f"{opening_line}say only that the {kind} question is now visible and invite the candidate "
            "to begin. Do not read, quote, paraphrase or describe it. Then remain silent until the "
            f"candidate submits or gives up.{language_suffix}"
        )
    return f"ORCHESTRATOR TURN {item.id}. {boundary}\n\n{delivery}"
