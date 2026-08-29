"""Single source of truth for speech configuration.

The user picks a LANGUAGE. Everything else - which STT vendor, which model,
which TTS vendor, which voice - is derived here and is not user-editable.

Why these two vendors specifically:
Both are on Agora's *managed* path, meaning no vendor API keys are needed and
nothing extra has to go in backend/.env:
  - DeepgramSTT with model "nova-2"/"nova-3"  (see agora_agent presets.py:
    DeepgramPresetModels - api_key is only required for other models)
  - MiniMaxTTS with model "speech-2.6-turbo"/"speech-2.8-turbo"
    (MiniMaxPresetModels - key/group_id only required for other models)
Swapping either vendor later means editing STT_MODEL/TTS_MODEL and the
`build_stt`/`build_tts` factories below, and nothing else in the codebase.

Voice IDs below are real MiniMax system voice IDs, taken from
https://platform.minimax.io/docs/faq/system-voice-id - they are not guesses.
If MiniMax retires one, only this file needs changing.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from agora_agent import DeepgramSTT, MiniMaxTTS

# Agora-managed models. Changing these to a non-preset model means you must
# also start passing that vendor's api_key/group_id in the factories below.
STT_VENDOR = "deepgram"
STT_MODEL = "nova-3"
TTS_VENDOR = "minimax"
TTS_MODEL = "speech-2.6-turbo"


@dataclass(frozen=True)
class VoiceOption:
    id: str          # MiniMax voice_id
    label: str       # shown in the UI, read-only
    gender: str      # "male" | "female" - only used to vary a panel's voices


@dataclass(frozen=True)
class LanguageProfile:
    code: str                     # what the panel config stores, e.g. "en-US"
    label: str                    # what the builder shows
    asr_language: str             # language code handed to Deepgram
    language_boost: str | None    # MiniMax pronunciation hint, None to skip
    voices: tuple[VoiceOption, ...]
    asr_model: str = STT_MODEL    # per-language override hatch, rarely needed


# Ordered - the first entry is the default for new panels.
# Every code here is in Agora's AsrLanguage literal AND has MiniMax voices.
LANGUAGES: tuple[LanguageProfile, ...] = (
    LanguageProfile(
        code="en-US",
        label="English (US)",
        asr_language="en-US",
        language_boost="English",
        voices=(
            VoiceOption("English_Trustworth_Man", "Trustworthy Man", "male"),
            VoiceOption("English_ConfidentWoman", "Confident Woman", "female"),
            VoiceOption("English_Steadymentor", "Reliable Man", "male"),
            VoiceOption("English_Graceful_Lady", "Graceful Lady", "female"),
            VoiceOption("English_WiseScholar", "Wise Scholar", "male"),
            VoiceOption("English_MatureBoss", "Bossy Lady", "female"),
        ),
    ),
    LanguageProfile(
        code="en-IN",
        label="English (India)",
        asr_language="en-IN",
        language_boost="English",
        voices=(
            VoiceOption("English_Trustworth_Man", "Trustworthy Man", "male"),
            VoiceOption("English_ConfidentWoman", "Confident Woman", "female"),
            VoiceOption("English_Steadymentor", "Reliable Man", "male"),
            VoiceOption("English_Graceful_Lady", "Graceful Lady", "female"),
        ),
    ),
    LanguageProfile(
        code="hi-IN",
        label="Hindi",
        asr_language="hi-IN",
        language_boost="Hindi",
        voices=(
            VoiceOption("hindi_male_1_v2", "Trustworthy Advisor", "male"),
            VoiceOption("hindi_female_2_v1", "Tranquil Woman", "female"),
            VoiceOption("hindi_female_1_v2", "News Anchor", "female"),
        ),
    ),
    LanguageProfile(
        code="es-ES",
        label="Spanish",
        asr_language="es-ES",
        language_boost="Spanish",
        voices=(
            VoiceOption("Spanish_ThoughtfulMan", "Thoughtful Man", "male"),
            VoiceOption("Spanish_ConfidentWoman", "Confident Woman", "female"),
            VoiceOption("Spanish_SensibleManager", "Sensible Manager", "male"),
            VoiceOption("Spanish_Wiselady", "Wise Lady", "female"),
        ),
    ),
    LanguageProfile(
        code="fr-FR",
        label="French",
        asr_language="fr-FR",
        language_boost="French",
        voices=(
            VoiceOption("French_Male_Speech_New", "Level-Headed Man", "male"),
            VoiceOption("French_FemaleAnchor", "Female Anchor", "female"),
            VoiceOption("French_MaleNarrator", "Male Narrator", "male"),
            VoiceOption("French_MovieLeadFemale", "Movie Lead Female", "female"),
        ),
    ),
    LanguageProfile(
        code="de-DE",
        label="German",
        asr_language="de-DE",
        language_boost="German",
        voices=(
            VoiceOption("German_FriendlyMan", "Friendly Man", "male"),
            VoiceOption("German_SweetLady", "Sweet Lady", "female"),
            VoiceOption("German_PlayfulMan", "Playful Man", "male"),
        ),
    ),
    LanguageProfile(
        code="pt-PT",
        label="Portuguese",
        asr_language="pt-PT",
        language_boost="Portuguese",
        voices=(
            VoiceOption("Portuguese_ThoughtfulMan", "Thoughtful Man", "male"),
            VoiceOption("Portuguese_ConfidentWoman", "Confident Woman", "female"),
            VoiceOption("Portuguese_SensibleManager", "Sensible Manager", "male"),
            VoiceOption("Portuguese_Wiselady", "Wise Lady", "female"),
        ),
    ),
    LanguageProfile(
        code="it-IT",
        label="Italian",
        asr_language="it-IT",
        language_boost="Italian",
        voices=(
            VoiceOption("Italian_DiligentLeader", "Diligent Leader", "male"),
            VoiceOption("Italian_BraveHeroine", "Brave Heroine", "female"),
            VoiceOption("Italian_Narrator", "Narrator", "male"),
        ),
    ),
    LanguageProfile(
        code="nl-NL",
        label="Dutch",
        asr_language="nl-NL",
        language_boost="Dutch",
        voices=(
            VoiceOption("Dutch_bossy_leader", "Bossy Leader", "male"),
            VoiceOption("Dutch_kindhearted_girl", "Kind-hearted Girl", "female"),
        ),
    ),
    LanguageProfile(
        code="ru-RU",
        label="Russian",
        asr_language="ru-RU",
        language_boost="Russian",
        voices=(
            VoiceOption("Russian_ReliableMan", "Reliable Man", "male"),
            VoiceOption("Russian_AmbitiousWoman", "Ambitious Woman", "female"),
        ),
    ),
    LanguageProfile(
        code="ja-JP",
        label="Japanese",
        asr_language="ja-JP",
        language_boost="Japanese",
        voices=(
            VoiceOption("Japanese_IntellectualSenior", "Intellectual Senior", "male"),
            VoiceOption("Japanese_DependableWoman", "Dependable Woman", "female"),
            VoiceOption("Japanese_GentleButler", "Gentle Butler", "male"),
            VoiceOption("Japanese_CalmLady", "Calm Lady", "female"),
        ),
    ),
    LanguageProfile(
        code="ko-KR",
        label="Korean",
        asr_language="ko-KR",
        language_boost="Korean",
        voices=(
            VoiceOption("Korean_IntellectualMan", "Intellectual Man", "male"),
            VoiceOption("Korean_ThoughtfulWoman", "Thoughtful Woman", "female"),
            VoiceOption("Korean_CalmGentleman", "Calm Gentleman", "male"),
            VoiceOption("Korean_WiseTeacher", "Wise Teacher", "male"),
        ),
    ),
    LanguageProfile(
        code="zh-CN",
        label="Chinese (Mandarin)",
        asr_language="zh-CN",
        language_boost="Chinese",
        voices=(
            VoiceOption("Chinese (Mandarin)_Reliable_Executive", "Reliable Executive", "male"),
            VoiceOption("Chinese (Mandarin)_Wise_Women", "Wise Woman", "female"),
            VoiceOption("Chinese (Mandarin)_Gentleman", "Gentleman", "male"),
            VoiceOption("Chinese (Mandarin)_IntellectualGirl", "Intellectual Girl", "female"),
        ),
    ),
    LanguageProfile(
        code="ar-SA",
        label="Arabic",
        asr_language="ar-SA",
        language_boost="Arabic",
        voices=(
            VoiceOption("Arabic_FriendlyGuy", "Friendly Guy", "male"),
            VoiceOption("Arabic_CalmWoman", "Calm Woman", "female"),
        ),
    ),
    LanguageProfile(
        code="tr-TR",
        label="Turkish",
        asr_language="tr-TR",
        language_boost="Turkish",
        voices=(
            VoiceOption("Turkish_Trustworthyman", "Trustworthy Man", "male"),
            VoiceOption("Turkish_CalmWoman", "Calm Woman", "female"),
        ),
    ),
    LanguageProfile(
        code="id-ID",
        label="Indonesian",
        asr_language="id-ID",
        language_boost="Indonesian",
        voices=(
            VoiceOption("Indonesian_CaringMan", "Caring Man", "male"),
            VoiceOption("Indonesian_ConfidentWoman", "Confident Woman", "female"),
            VoiceOption("Indonesian_BossyLeader", "Bossy Leader", "male"),
        ),
    ),
    LanguageProfile(
        code="vi-VN",
        label="Vietnamese",
        asr_language="vi-VN",
        language_boost="Vietnamese",
        voices=(
            VoiceOption("Vietnamese_kindhearted_girl", "Kind-hearted Girl", "female"),
        ),
    ),
    LanguageProfile(
        code="th-TH",
        label="Thai",
        asr_language="th-TH",
        language_boost="Thai",
        voices=(
            VoiceOption("Thai_male_1_sample8", "Serene Man", "male"),
            VoiceOption("Thai_female_1_sample1", "Confident Woman", "female"),
        ),
    ),
)

DEFAULT_LANGUAGE = LANGUAGES[0].code

_BY_CODE: dict[str, LanguageProfile] = {p.code: p for p in LANGUAGES}


def get_profile(language_code: str | None) -> LanguageProfile:
    """Never raises. An unknown/missing code falls back to the default rather
    than 500-ing a live session - a panel saved before this registry existed
    (or with a language we later dropped) still runs, just in English."""
    if language_code and language_code in _BY_CODE:
        return _BY_CODE[language_code]
    return _BY_CODE[DEFAULT_LANGUAGE]


def list_languages() -> list[dict]:
    """Payload for GET /config/languages, so the builder dropdown is built from
    this file rather than a hand-maintained copy that can drift out of sync."""
    return [
        {
            "code": p.code,
            "label": p.label,
            "sttVendor": STT_VENDOR,
            "sttModel": p.asr_model,
            "ttsVendor": TTS_VENDOR,
            "ttsModel": TTS_MODEL,
            "voices": [{"id": v.id, "label": v.label, "gender": v.gender} for v in p.voices],
        }
        for p in LANGUAGES
    ]


def assign_voices(agent_ids: list[str], language_code: str | None) -> dict[str, str]:
    """Deterministically give each agent its own voice from the language's pool.

    Keyed on position in the panel, so the same panel config always produces the
    same voices - important because the builder previews a voice name that the
    live session then has to actually match. Panels with more agents than the
    pool has voices wrap around and repeat; that's better than failing.
    """
    profile = get_profile(language_code)
    pool = profile.voices
    return {agent_id: pool[i % len(pool)].id for i, agent_id in enumerate(agent_ids)}


def voice_label(voice_id: str, language_code: str | None) -> str:
    for v in get_profile(language_code).voices:
        if v.id == voice_id:
            return v.label
    return voice_id


def build_stt(language_code: str | None) -> DeepgramSTT:
    profile = get_profile(language_code)
    return DeepgramSTT(
        model=profile.asr_model,
        language=profile.asr_language,
        # no api_key: nova-2/nova-3 run on Agora's managed key
    )


def build_tts(language_code: str | None, voice_id: str | None = None) -> MiniMaxTTS:
    profile = get_profile(language_code)
    chosen = voice_id or profile.voices[0].id
    kwargs: dict = {"model": TTS_MODEL, "voice_id": chosen}
    if profile.language_boost:
        kwargs["language_boost"] = profile.language_boost
    # no key/group_id: speech-2.6-turbo runs on Agora's managed key
    return MiniMaxTTS(**kwargs)
