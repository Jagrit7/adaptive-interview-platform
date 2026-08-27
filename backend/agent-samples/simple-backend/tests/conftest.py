"""Pytest configuration and fixtures for simple-backend tests"""

import pytest
import os
import sys

# Add parent directory to path so we can import modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from local_server import app as flask_app


@pytest.fixture
def app():
    """Create Flask app for testing"""
    flask_app.config.update({
        "TESTING": True,
    })
    yield flask_app


@pytest.fixture
def client(app):
    """Create Flask test client"""
    return app.test_client()


@pytest.fixture
def test_constants():
    """Sample constants for testing"""
    import base64
    # Create basic auth header
    credentials = base64.b64encode(b"test_api_key:test_api_secret").decode('ascii')

    return {
        "APP_ID": "abcdef1234567890abcdef1234567890",  # 32-char hex
        "APP_CERTIFICATE": "fedcba0987654321fedcba0987654321",  # 32-char hex
        "TOKEN_EXPIRE": 86400,
        "PRIVILEGE_EXPIRE": 86400,
        "USER_UID": 123,
        "AGENT_UID": 456,
        "AGENT_VIDEO_UID": 789,
        "AGENT_ENDPOINT": "https://api.agora.io/api/conversational-ai-agent/v2/projects",
        "AGENT_API_KEY": "test_api_key",
        "AGENT_API_SECRET": "test_api_secret",
        "AGENT_AUTH_HEADER": f"Basic {credentials}",
        "LLM_MODEL": "gpt-4",
        "LLM_API_KEY": "test_llm_key",
        "LLM_URL": "https://api.openai.com/v1/chat/completions",
        "TTS_VENDOR": "openai",
        "TTS_KEY": "test_tts_key",
        "TTS_VOICE_ID": "alloy",
        "TTS_SAMPLE_RATE": 16000,
        "TTS_SPEED": 1.0,
        "OPENAI_TTS_MODEL": "tts-1",
        "ELEVENLABS_MODEL": "eleven_turbo_v2_5",
        "ELEVENLABS_STABILITY": 0.5,
        "CARTESIA_MODEL": "sonic",
        "RIME_MODEL_ID": "mist",
        "RIME_LANG": "en",
        "RIME_SAMPLING_RATE": 16000,
        "RIME_SPEED_ALPHA": 1.0,
        "ASR_VENDOR": "ares",
        "ASR_LANGUAGE": "en-US",
        "DEEPGRAM_KEY": "test_deepgram_key",
        "DEEPGRAM_MODEL": "nova-2",
        "DEEPGRAM_LANGUAGE": "en-US",
        "DEFAULT_PROMPT": "You are a helpful assistant",
        "DEFAULT_GREETING": "Hello! How can I help you?",
        "DEFAULT_FAILURE_MESSAGE": "Sorry, I encountered an error",
        "MAX_HISTORY": 10,
        "IDLE_TIMEOUT": 300,
        "VAD_SILENCE_DURATION_MS": 500,
        "ENABLE_AIVAD": "false",
        "AVATAR_VENDOR": "",
        "AVATAR_API_KEY": "",
        "AVATAR_ID": "",
        "HEYGEN_QUALITY": "high",
        "HEYGEN_ACTIVITY_IDLE_TIMEOUT": 60,
        "ANAM_AGENT_ENDPOINT": "https://api-test.agora.io/api/conversational-ai-agent/v2/projects",
        "AVATAR_QUALITY": "high",
        "AVATAR_VERSION": "v1",
        "AVATAR_VIDEO_ENCODING": "H264",
        "AVATAR_ACTIVITY_IDLE_TIMEOUT": "120",
        "AVATAR_AREA": "NORTH_AMERICA",
        "AVATAR_API_BASE_URL": "https://example.com/api/liveai/agora"
    }
