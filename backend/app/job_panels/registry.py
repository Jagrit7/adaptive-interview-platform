from app.job_panels.presets import JOB_PANEL_PRESETS
from app.schemas.job_panel import JobPanelPreset, JobPanelSummary


def get_job_panel(slug: str) -> JobPanelPreset | None:
    preset = JOB_PANEL_PRESETS.get(slug)
    return preset.model_copy(deep=True) if preset else None


def list_job_panels() -> list[JobPanelSummary]:
    return [
        JobPanelSummary(
            slug=preset.slug,
            version=preset.version,
            jobFamily=preset.jobFamily,
            title=preset.title,
            description=preset.description,
            status=preset.status,
            totalDurationMinutes=sum(stage.durationMinutes for stage in preset.stages),
            stageCount=len(preset.stages),
            stages=preset.stages,
        )
        for preset in JOB_PANEL_PRESETS.values()
    ]
