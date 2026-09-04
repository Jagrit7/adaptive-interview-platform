from pydantic import BaseModel, Field
from typing import Literal

from app.config.voice_profiles import DEFAULT_LANGUAGE

RoleType = Literal["Technical", "Hiring manager", "Product", "Customer", "Behavioural", "Custom"]

KnowledgeMode = Literal["llm", "knowledge_base"]
QuestionKind = Literal["coding", "written", "verbal"]
QuestionBankId = Literal["dsa", "system-design", "custom"]
QuestionDomain = Literal["dsa", "system_design", "behavioural", "product", "customer", "general"]


class Identity(BaseModel):
    name: str
    role: RoleType
    color: str
    avatar: str


class Voice(BaseModel):
    """Optional per-interviewer voice preference.

    The backend accepts a voice only when it belongs to the selected panel
    language. Older provider/language fields remain optional for saved-panel
    compatibility; they never override the managed Agora speech stack.
    """
    provider: str | None = None
    voiceId: str | None = None
    language: str | None = None
    speakingStyle: str | None = None


class Behavior(BaseModel):
    systemPrompt: str
    greetingMessage: str
    fallbackMessage: str
    scenarioBrief: str


class Logic(BaseModel):
    difficultyBand: tuple[int, int]
    seedQuestions: list[str] = Field(default_factory=list)
    followUpAggressiveness: int
    maxTurns: int          # questions per visit
    maxVisits: int = 3     # max revisits before force-close
    # Ordered-flow controls. Defaults preserve panels saved before ADR 011.
    questionKinds: list[QuestionKind] = Field(default_factory=lambda: ["verbal", "written", "coding"])
    maxRetriesPerQuestion: int = Field(default=1, ge=0, le=5)
    vagueProbing: bool = True
    # Confidence that this interviewer has enough evidence to assess the
    # candidate. This is deliberately independent of whether the answer is good.
    satisfactionThreshold: float = Field(default=0.8, ge=0, le=1)


class KnowledgeItem(BaseModel):
    """One question/answer pair from an uploaded knowledge base."""
    id: str
    question: str
    idealAnswer: str = ""
    tags: list[str] = Field(default_factory=list)
    difficulty: int | None = None
    kind: QuestionKind | None = None
    # Explicit ownership used by the orchestrator. Optional so older saved
    # panels can be upgraded from their tags/text at session hydration.
    domain: QuestionDomain | None = None


class Knowledge(BaseModel):
    """Per-agent knowledge base.

    mode="llm"            -> the agent invents its own questions (previous behaviour).
    mode="knowledge_base" -> the agent is fed questions from `items`, one per
                             turn, and the scorer grades answers against
                             `idealAnswer` instead of its own judgement.

    `strict` only matters in knowledge_base mode: True means the agent may not
    ask anything outside the list (it ends its visit when the list runs out),
    False means it works through the list first and may then improvise.
    """
    mode: KnowledgeMode = "llm"
    strict: bool = True
    sourceName: str = ""
    bankId: QuestionBankId = "custom"
    items: list[KnowledgeItem] = Field(default_factory=list)

    def is_active(self) -> bool:
        return self.mode == "knowledge_base" and len(self.items) > 0


class Skills(BaseModel):
    rolePlayMode: bool
    loopUntilSatisfied: bool
    contradictionProbing: bool


class TurnTaking(BaseModel):
    canOpen: bool
    handoffTriggers: str
    priority: Literal["low", "medium", "high"]


class Scoring(BaseModel):
    competencies: list[str]
    # Share of the final panel score assigned to this interviewer. New panels
    # set it explicitly; None keeps old saved panels valid so report generation
    # can derive their previous share from the legacy panel-level rubric.
    weight: float | None = Field(default=None, ge=0)


class Agent(BaseModel):
    id: str
    identity: Identity
    voice: Voice = Field(default_factory=Voice)   # legacy, ignored at runtime
    behavior: Behavior
    logic: Logic
    knowledge: Knowledge = Field(default_factory=Knowledge)
    skills: Skills
    tools: list[str] = Field(default_factory=list)
    turnTaking: TurnTaking
    scoring: Scoring


class CompetencyRule(BaseModel):
    name: str
    weight: float
    threshold: float


class Scorer(BaseModel):
    competencies: list[CompetencyRule] = Field(default_factory=list)


class HostConfig(BaseModel):
    """The +1 conversational LLM that opens, orchestrates and closes."""
    name: str = "Interview Host"
    systemPrompt: str = (
        "You are a warm, concise interview host. Make transitions feel natural, "
        "never answer interview questions, and never announce scores."
    )
    introFields: list[str] = Field(default_factory=lambda: ["preferred_name", "current_role"])
    openingInstruction: str = "Greet the candidate and ask one short introductory question."
    closingInstruction: str = "Thank the candidate warmly and explain that the interview is complete."
    voiceId: str | None = None


class FlowStep(BaseModel):
    id: str
    agentId: str
    questionKinds: list[QuestionKind] = Field(default_factory=lambda: ["verbal"])
    questionCount: int = Field(default=1, ge=1, le=50)
    maxRetriesPerQuestion: int = Field(default=1, ge=0, le=5)
    vagueProbe: bool = True
    satisfactionThreshold: float = Field(default=0.8, ge=0, le=1)
    handoffCondition: str = ""


class InterviewFlow(BaseModel):
    version: Literal[1] = 1
    host: HostConfig = Field(default_factory=HostConfig)
    steps: list[FlowStep] = Field(default_factory=list)


class Panel(BaseModel):
    projectName: str

    # One language for the whole panel, not per agent. The session runs a single
    # Agora agent instance whose STT language is fixed at Join time and cannot be
    # changed by session.update() (its properties schema only accepts
    # token/llm/mllm), so a mixed-language panel is not expressible in the
    # current single-instance architecture. Making it panel-level means the UI
    # can't put the user into a state the backend can't honour.
    language: str = DEFAULT_LANGUAGE

    agents: list[Agent]
    scorer: Scorer = Field(default_factory=Scorer)
    flow: InterviewFlow | None = None

    def resolved_flow(self) -> InterviewFlow:
        """Upgrade legacy panels in memory without a Supabase migration."""
        if self.flow and self.flow.steps:
            return self.flow
        return InterviewFlow(steps=[
            FlowStep(
                id=f"step-{index + 1}", agentId=agent.id,
                questionKinds=agent.logic.questionKinds,
                questionCount=(min(agent.logic.maxTurns, len(agent.knowledge.items))
                               if agent.knowledge.is_active() else agent.logic.maxTurns),
                maxRetriesPerQuestion=agent.logic.maxRetriesPerQuestion,
                vagueProbe=agent.logic.vagueProbing,
                satisfactionThreshold=agent.logic.satisfactionThreshold,
                handoffCondition=agent.turnTaking.handoffTriggers,
            )
            for index, agent in enumerate(self.agents)
        ])
