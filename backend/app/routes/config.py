from fastapi import APIRouter
from pydantic import BaseModel

from app.config.voice_profiles import DEFAULT_LANGUAGE, list_languages

router = APIRouter(prefix="/config", tags=["config"])


class VoiceOut(BaseModel):
    id: str
    label: str
    gender: str


class LanguageOut(BaseModel):
    code: str
    label: str
    nativeName: str
    defaultGreeting: str
    sttVendor: str
    sttModel: str
    ttsVendor: str
    ttsModel: str
    voices: list[VoiceOut]


class LanguagesResponse(BaseModel):
    default: str
    languages: list[LanguageOut]


@router.get("/languages", response_model=LanguagesResponse)
def get_languages():
    """The builder's language dropdown is built from this.

    frontend/lib/languages.ts ships a static copy so the UI renders before the
    backend answers, but it refreshes from here on mount - that way adding a
    language to voice_profiles.py is a one-file change and the two can't
    silently drift apart.
    """
    return LanguagesResponse(default=DEFAULT_LANGUAGE, languages=list_languages())
