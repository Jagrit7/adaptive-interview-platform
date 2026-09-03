from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.panel import Panel


StageKind = Literal["hybrid_coding", "verbal"]
PresetStatus = Literal["active", "coming_soon"]


class JobPanelStage(BaseModel):
    id: str
    title: str
    agentId: str
    order: int = Field(ge=1)
    kind: StageKind
    durationMinutes: int = Field(ge=1, le=180)
    description: str


class JobPanelPreset(BaseModel):
    slug: str
    version: int = Field(ge=1)
    jobFamily: str
    title: str
    description: str
    status: PresetStatus = "active"
    panel: Panel
    stages: list[JobPanelStage]

    @model_validator(mode="after")
    def validate_stage_contract(self):
        agent_ids = [agent.id for agent in self.panel.agents]
        stage_agent_ids = [stage.agentId for stage in self.stages]
        orders = [stage.order for stage in self.stages]
        if len(agent_ids) != len(set(agent_ids)):
            raise ValueError("Panel agent IDs must be unique")
        if len(orders) != len(set(orders)) or sorted(orders) != list(range(1, len(orders) + 1)):
            raise ValueError("Stage order must be unique and contiguous from 1")
        if stage_agent_ids != agent_ids:
            raise ValueError("Stages must reference every panel agent in panel order")
        return self


class JobPanelSummary(BaseModel):
    slug: str
    version: int
    jobFamily: str
    title: str
    description: str
    status: PresetStatus
    totalDurationMinutes: int
    stageCount: int
    stages: list[JobPanelStage]
