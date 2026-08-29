from pydantic import BaseModel, Field
from typing import Literal


class CompetencyScore(BaseModel):
    score: float = 0.0          # 0-1, current best score for this competency
    covered: bool = False        # score >= scorer threshold for this competency


class AgentSessionState(BaseModel):
    agent_id: str
    visit_count: int = 0
    competency_scores: dict[str, CompetencyScore] = Field(default_factory=dict)
    force_closed: bool = False   # true if closed via maxVisits rather than full satisfaction

    # Knowledge-base mode only. asked_item_ids is what makes "stick to the
    # knowledge base" a real guarantee: the orchestrator walks this set to pick
    # the next unasked question rather than trusting the LLM to track its own
    # progress through the bank. pending_item_id is the question the agent was
    # last told to ask, so the scorer knows which reference answer to grade
    # against when the reply comes back.
    asked_item_ids: list[str] = Field(default_factory=list)
    pending_item_id: str | None = None
    bank_exhausted: bool = False

    def satisfaction(self) -> float:
        """Fraction of this agent's competencies currently covered, 0-1."""
        if not self.competency_scores:
            return 1.0  # no competencies defined -> nothing to satisfy
        covered = sum(1 for c in self.competency_scores.values() if c.covered)
        return covered / len(self.competency_scores)

    def is_done(self, max_visits: int) -> bool:
        return self.satisfaction() >= 1.0 or (self.visit_count >= max_visits and self.force_closed)

    def mark_asked(self, item_id: str) -> None:
        if item_id not in self.asked_item_ids:
            self.asked_item_ids.append(item_id)
        self.pending_item_id = item_id


class TranscriptTurn(BaseModel):
    turn_number: int
    agent_id: str
    speaker: Literal["agent", "candidate"]
    text: str
    flags: list[str] = Field(default_factory=list)   # e.g. "vague", "contradiction"
    knowledge_item_id: str | None = None             # which bank question this answered
    coverage: float | None = None                    # 0-1 vs the reference answer


class SessionState(BaseModel):
    session_id: str
    panel_project_name: str
    language: str | None = None
    current_agent_id: str | None = None
    current_visit_turn_count: int = 0     # turns taken during the CURRENT visit only
    queue: list[str] = Field(default_factory=list)     # agent_ids still waiting/eligible
    agent_states: dict[str, AgentSessionState] = Field(default_factory=dict)
    transcript: list[TranscriptTurn] = Field(default_factory=list)
    is_finished: bool = False

    def get_agent_state(self, agent_id: str) -> AgentSessionState:
        if agent_id not in self.agent_states:
            self.agent_states[agent_id] = AgentSessionState(agent_id=agent_id)
        return self.agent_states[agent_id]
