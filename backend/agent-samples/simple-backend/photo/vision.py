"""Call OpenAI GPT-4o-mini vision on an uploaded image.

Returns a structured dict:
    {
        "sex": "male" | "female" | None,
        "age_bucket": "young" | "middle" | "mature" | None,
        "bbox": [x, y, w, h]  # 0..1 fractional coordinates, may be None
    }

Errors return None for individual fields; never raises (the caller will
fall back to defaults).
"""

from __future__ import annotations

import base64
import json
import logging
import os
from typing import Any

import urllib.error
import urllib.request

logger = logging.getLogger(__name__)

OPENAI_URL = "https://api.openai.com/v1/chat/completions"
MODEL = "gpt-4o-mini"
TIMEOUT_SECONDS = 30

SYSTEM_PROMPT = (
    "You analyse one photo of a person. Reply with ONLY a single-line JSON object: "
    '{"sex":"male"|"female"|null, "age_bucket":"young"|"middle"|"mature"|null, '
    '"bbox":[x,y,w,h]}. The bbox is the bounding box around the head and shoulders '
    "of the primary person, given as four numbers between 0 and 1 (x and y are the "
    "top-left, w and h are width and height), normalised to image dimensions. Use "
    "null if no clear primary person is visible. Age buckets: young (under 30), "
    "middle (30-55), mature (over 55). No prose, no markdown, just the JSON."
)


def analyse_image(image_bytes: bytes, *, mime_type: str = "image/jpeg") -> dict[str, Any]:
    """Run GPT-4o-mini vision on the given image bytes."""
    api_key = os.environ.get("OPENAI_API_KEY") or os.environ.get("PHOTO_VISION_API_KEY")
    if not api_key:
        logger.warning("No OPENAI_API_KEY / PHOTO_VISION_API_KEY set; skipping vision")
        return {"sex": None, "age_bucket": None, "bbox": None}

    b64 = base64.b64encode(image_bytes).decode("ascii")
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Analyse this photo."},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime_type};base64,{b64}"},
                    },
                ],
            },
        ],
        "response_format": {"type": "json_object"},
        "max_tokens": 200,
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        OPENAI_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as response:
            raw = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, json.JSONDecodeError) as exc:
        logger.warning("Vision request failed: %s", exc)
        return {"sex": None, "age_bucket": None, "bbox": None}

    try:
        content = raw["choices"][0]["message"]["content"]
        parsed = json.loads(content)
    except (KeyError, IndexError, json.JSONDecodeError) as exc:
        logger.warning("Vision response unparseable: %s", exc)
        return {"sex": None, "age_bucket": None, "bbox": None}

    return {
        "sex": _norm_sex(parsed.get("sex")),
        "age_bucket": _norm_age(parsed.get("age_bucket")),
        "bbox": _norm_bbox(parsed.get("bbox")),
    }


def _norm_sex(v: Any) -> str | None:
    if isinstance(v, str) and v.lower() in ("male", "female"):
        return v.lower()
    return None


def _norm_age(v: Any) -> str | None:
    if isinstance(v, str) and v.lower() in ("young", "middle", "mature"):
        return v.lower()
    return None


def _norm_bbox(v: Any) -> list[float] | None:
    if not isinstance(v, (list, tuple)) or len(v) != 4:
        return None
    try:
        coords = [max(0.0, min(1.0, float(x))) for x in v]
    except (TypeError, ValueError):
        return None
    return coords
