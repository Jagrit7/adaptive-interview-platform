from pydantic import BaseModel
from typing import Literal

RoleType = Literal["Technical", "Hiring manager", "Product", "Customer", "Behavioural", "Custom"]


class Identity(BaseModel):
    name: str
    role: RoleType
    color: str
    avatar: str


class Voice(BaseModel):
    provider: str
    voiceId: str
    language: str
    speakingStyle: str


class Behavior(BaseModel):
    systemPrompt: str
    greetingMessage: str
    fallbackMessage: str
    scenarioBrief: str


class Logic(BaseModel):
    difficultyBand: tuple[int, int]
    seedQuestions: list[str]
    followUpAggressiveness: int
    maxTurns: int          # questions per visit
    maxVisits: int = 3     # NEW - max times this agent can be revisited before force-close


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


class Agent(BaseModel):
    id: str
    identity: Identity
    voice: Voice
    behavior: Behavior
    logic: Logic
    skills: Skills
    tools: list[str]
    turnTaking: TurnTaking
    scoring: Scoring


class CompetencyRule(BaseModel):
    name: str
    weight: float
    threshold: float


class Scorer(BaseModel):
    competencies: list[CompetencyRule]


class Panel(BaseModel):
    projectName: str
    agents: list[Agent]
    scorer: Scorer