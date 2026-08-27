"""Curated ElevenLabs voice catalog mapped by sex + age bucket.

Values are voice IDs from ElevenLabs' default public voice library.
Swap any of these per personal preference — they're chosen as recognisable
fallbacks that work on flash_v2_5.
"""

# (sex, age_bucket) -> voice_id
VOICE_CATALOG = {
    ("female", "young"):  "EXAVITQu4vr4xnSDxMaL",  # Bella — bright, young female
    ("female", "middle"): "21m00Tcm4TlvDq8ikWAM",  # Rachel — calm, narrative female
    ("female", "mature"): "XB0fDUnXU5powFXDhCwa",  # Charlotte — warm, mature female
    ("male",   "young"):  "TX3LPaxmHKxFdv7VOQHJ",  # Liam — articulate, young male
    ("male",   "middle"): "pNInz6obpgDQGcFmaJgB",  # Adam — deep, mid male
    ("male",   "mature"): "onwK4e9ZLuTAKqWW03F9",  # Daniel — grounded, mature male
}

# Used when vision returns unknown or fails entirely.
DEFAULT_VOICE_ID = "cgSgspJ2msm6clMCkdW9"

# Valid buckets we accept from the vision pipeline.
AGE_BUCKETS = ("young", "middle", "mature")


def pick_voice(sex: str | None, age_bucket: str | None) -> str:
    """Return a voice_id for the given sex + age bucket. Falls back gracefully."""
    if not sex or sex.lower() not in ("male", "female"):
        return DEFAULT_VOICE_ID
    bucket = (age_bucket or "").lower()
    if bucket not in AGE_BUCKETS:
        bucket = "middle"
    return VOICE_CATALOG.get((sex.lower(), bucket), DEFAULT_VOICE_ID)


# Gemini Live voices keyed by detected sex. Aoede (warm female) and Orus
# (firm male) tested well for a general "photo avatar" demo.
GEMINI_VOICE_BY_SEX = {
    "female": "Aoede",
    "male":   "Orus",
}
GEMINI_DEFAULT_VOICE = "Aoede"


def pick_gemini_voice(sex: str | None) -> str:
    return GEMINI_VOICE_BY_SEX.get((sex or "").lower(), GEMINI_DEFAULT_VOICE)
