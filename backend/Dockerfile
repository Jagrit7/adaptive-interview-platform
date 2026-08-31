# syntax=docker/dockerfile:1

# Backend: FastAPI + the Agora agent SDK.
#
# Build context is ./backend, so the vendored agora-token-tools directory is
# inside it. That matters: token_generator.py imports RtcTokenBuilder2 by
# appending that path to sys.path, and RtcTokenBuilder2 is not on PyPI. Omit the
# COPY below and the container starts, then 500s the first time anyone requests
# a token.

FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Requirements first, so editing application code doesn't invalidate the
# dependency layer on every rebuild.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Application code.
COPY app/ ./app/
COPY recipes/ ./recipes/
COPY knowledge-bases/ ./knowledge-bases/
COPY sample-knowledge-base.csv ./

# Vendored, not on PyPI - see the note at the top of this file.
COPY agora-token-tools/DynamicKey/AgoraDynamicKey/python/src/ \
     ./agora-token-tools/DynamicKey/AgoraDynamicKey/python/src/

# Non-root. Nothing here writes to disk, so no writable volumes are needed.
RUN useradd --create-home --uid 10001 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# No HEALTHCHECK curl: the slim image has neither curl nor wget, and installing
# one only to health-check is not worth the layer. Python is already here.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status==200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
