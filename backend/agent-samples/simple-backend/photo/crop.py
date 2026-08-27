"""Crop + resize uploaded photos using PIL.

Cropping is keyed off the bbox from the vision pipeline (fractional
coordinates). If bbox is missing, we fall back to a centre square crop
so the user still gets a usable avatar image.

Output is a JPEG, max edge 768px, RGB, no EXIF — LemonSlice-friendly.
"""

from __future__ import annotations

import io
import logging
from typing import Iterable

from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

MAX_EDGE = 768
MARGIN_FRACTION = 0.30  # 30% padding around the detected box
JPEG_QUALITY = 88


def normalize_orientation(image_bytes: bytes) -> bytes:
    """Apply EXIF transpose + drop the EXIF tag so downstream consumers see
    pixels in the orientation the user actually shot. iPhones write the
    sensor's native rotation and stash the human-visible rotation in an EXIF
    Orientation tag — without this, every portrait selfie ends up sideways."""
    img = Image.open(io.BytesIO(image_bytes))
    img = ImageOps.exif_transpose(img)
    fmt = img.format or "JPEG"
    out = io.BytesIO()
    img.convert("RGB").save(out, format=fmt, quality=JPEG_QUALITY, optimize=True)
    return out.getvalue()


def crop_for_avatar(image_bytes: bytes, bbox: Iterable[float] | None) -> bytes:
    """Return JPEG bytes of the cropped + resized image."""
    img = Image.open(io.BytesIO(image_bytes))
    # Safety net even when the caller forgot to normalize first.
    img = ImageOps.exif_transpose(img)
    img = img.convert("RGB")
    w, h = img.size

    if bbox and len(list(bbox)) == 4:
        box = _expand(bbox, w, h, MARGIN_FRACTION)
    else:
        # Fallback: centre square at full image height
        side = min(w, h)
        x = (w - side) // 2
        y = (h - side) // 2
        box = (x, y, x + side, y + side)

    cropped = img.crop(box)
    cropped = _shrink_to_max_edge(cropped, MAX_EDGE)

    out = io.BytesIO()
    cropped.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return out.getvalue()


def _expand(bbox_frac: Iterable[float], img_w: int, img_h: int, margin: float) -> tuple[int, int, int, int]:
    """Convert fractional bbox -> pixel box, expand by `margin`, square in
    pixel space (LemonSlice prefers square crops), clamp to image bounds."""
    fx, fy, fw, fh = bbox_frac
    cx_px = (fx + fw / 2) * img_w
    cy_px = (fy + fh / 2) * img_h
    w_px = fw * img_w * (1 + 2 * margin)
    h_px = fh * img_h * (1 + 2 * margin)
    side = max(w_px, h_px)
    x1 = max(0, int(round(cx_px - side / 2)))
    y1 = max(0, int(round(cy_px - side / 2)))
    x2 = min(img_w, int(round(cx_px + side / 2)))
    y2 = min(img_h, int(round(cy_px + side / 2)))
    return (x1, y1, x2, y2)


def _shrink_to_max_edge(img: Image.Image, max_edge: int) -> Image.Image:
    w, h = img.size
    longest = max(w, h)
    if longest <= max_edge:
        return img
    ratio = max_edge / longest
    return img.resize((int(round(w * ratio)), int(round(h * ratio))), Image.LANCZOS)
