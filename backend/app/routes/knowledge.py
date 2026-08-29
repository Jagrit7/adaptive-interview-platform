from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.knowledge.store import KnowledgeParseError, parse_upload
from app.schemas.panel import KnowledgeItem

router = APIRouter(prefix="/knowledge", tags=["knowledge"])

MAX_UPLOAD_BYTES = 2 * 1024 * 1024  # 2 MB - a Q&A bank is text, nothing here is big


class ParseResponse(BaseModel):
    sourceName: str
    items: list[KnowledgeItem]
    count: int
    withAnswers: int   # how many items came with an ideal answer, shown in the UI


def _respond(source_name: str, items: list[KnowledgeItem]) -> ParseResponse:
    return ParseResponse(
        sourceName=source_name,
        items=items,
        count=len(items),
        withAnswers=sum(1 for i in items if i.idealAnswer.strip()),
    )


@router.post("/parse", response_model=ParseResponse)
async def parse_knowledge_file(file: UploadFile = File(...)):
    """Parses an uploaded Q&A file into normalised KnowledgeItems.

    Parsing lives on the backend rather than in the browser on purpose: it is the
    same code path the orchestrator and scorer read from, so what the builder
    previews is exactly what the interview will run. It also means quoted CSV
    fields, BOMs and latin-1 files are handled by the stdlib csv module instead
    of a hand-rolled split(',').

    The response is returned to the frontend rather than stored here - the items
    become part of the Panel JSON that already goes into Supabase's config
    column, so this adds no storage layer.
    """
    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"That file is larger than {MAX_UPLOAD_BYTES // (1024 * 1024)} MB. "
                   "Knowledge bases are plain question/answer text - if yours is this big, "
                   "split it across agents.",
        )

    try:
        items = parse_upload(file.filename or "", raw)
    except KnowledgeParseError as exc:
        # 422 with a message written for the user, not a stack trace. FastAPI's
        # own 422s are structured objects, so the frontend already handles both
        # shapes (see the [object Object] fix in InterviewRoomLive).
        raise HTTPException(status_code=422, detail=str(exc))

    return _respond(file.filename or "upload", items)


class ParseTextRequest(BaseModel):
    text: str
    sourceName: str = "Pasted questions"
    format: str = "txt"   # txt | md | csv | json | jsonl


@router.post("/parse-text", response_model=ParseResponse)
async def parse_knowledge_text(body: ParseTextRequest):
    """Same parser, for text pasted straight into the builder instead of uploaded."""
    if not body.text.strip():
        raise HTTPException(status_code=422, detail="Nothing to parse - the box is empty.")

    try:
        items = parse_upload(f"pasted.{body.format}", body.text.encode("utf-8"))
    except KnowledgeParseError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    return _respond(body.sourceName, items)
