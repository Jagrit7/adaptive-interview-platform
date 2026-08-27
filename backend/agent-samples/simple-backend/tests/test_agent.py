"""Tests for core.agent module"""

import pytest
from core.agent import build_tts_config, build_asr_config, build_mllm_config, create_agent_payload


@pytest.mark.unit
class TestBuildTTSConfig:
    """Tests for build_tts_config function"""

    def test_openai_tts_config(self, test_constants):
        """Test OpenAI TTS configuration"""
        config = build_tts_config("openai", test_constants)

        assert config["vendor"] == "openai"
        assert "params" in config
        assert config["params"]["api_key"] == "test_tts_key"
        assert config["params"]["model"] == "tts-1"
        assert config["params"]["voice"] == "alloy"
        assert config["params"]["response_format"] == "pcm"
        assert config["params"]["speed"] == 1.0

    def test_elevenlabs_tts_config(self, test_constants):
        """Test ElevenLabs TTS configuration"""
        constants = test_constants.copy()
        constants["TTS_VENDOR"] = "elevenlabs"
        constants["TTS_VOICE_ID"] = "test_voice_id"

        config = build_tts_config("elevenlabs", constants)

        assert config["vendor"] == "elevenlabs"
        assert "params" in config
        assert config["params"]["key"] == "test_tts_key"
        assert config["params"]["voice_id"] == "test_voice_id"
        assert config["params"]["model_id"] == "eleven_turbo_v2_5"
        assert config["params"]["stability"] == 0.5

    def test_elevenlabs_missing_voice_id(self, test_constants):
        """Test that ElevenLabs raises error without voice_id"""
        constants = test_constants.copy()
        constants["TTS_VOICE_ID"] = ""  # Empty voice ID
        with pytest.raises(ValueError, match="TTS_VOICE_ID is required"):
            build_tts_config("elevenlabs", constants)

    def test_query_param_overrides(self, test_constants):
        """Test that query params override defaults"""
        query_params = {
            "voice_id": "custom_voice",
            "voice_speed": "1.5"
        }

        config = build_tts_config("openai", test_constants, query_params)

        assert config["params"]["voice"] == "custom_voice"
        assert config["params"]["speed"] == 1.5


@pytest.mark.unit
class TestBuildASRConfig:
    """Tests for build_asr_config function"""

    def test_ares_asr_config(self, test_constants):
        """Test Ares ASR configuration"""
        constants = test_constants.copy()
        constants["ASR_VENDOR"] = "ares"
        constants["ASR_LANGUAGE"] = "en-US"

        config = build_asr_config("ares", constants)

        assert config["vendor"] == "ares"
        assert "language" in config
        assert config["language"] == "en-US"


@pytest.mark.unit
class TestBuildMLLMConfig:
    """Tests for build_mllm_config function"""

    def test_xai_mllm_config(self, test_constants):
        """Test xAI MLLM configuration uses the Agora xAI shape"""
        constants = test_constants.copy()
        constants.update({
            "MLLM_VENDOR": "xai",
            "MLLM_URL": "wss://api.x.ai/v1/realtime",
            "MLLM_API_KEY": "test_xai_key",
            "MLLM_VOICE": "eve",
            "MLLM_LANGUAGE": "en",
            "MLLM_SAMPLE_RATE": "24000",
            "DEFAULT_PROMPT": "You are a helpful assistant",
            "DEFAULT_GREETING": "Hello",
            "DEFAULT_FAILURE_MESSAGE": "Error",
        })

        config = build_mllm_config(constants)

        assert config["enable"] is True
        assert config["vendor"] == "xai"
        assert config["url"] == "wss://api.x.ai/v1/realtime"
        assert config["api_key"] == "test_xai_key"
        assert config["messages"] == [{"role": "system", "content": "You are a helpful assistant"}]
        assert config["params"] == {
            "voice": "eve",
            "language": "en",
            "sample_rate": 24000,
        }
        assert config["output_modalities"] == ["audio", "text"]

    def test_vertex_mllm_config_tolerates_missing_transcribe_flags(self, test_constants):
        """Test Vertex/Gemini MLLM configuration handles missing transcribe flags"""
        constants = test_constants.copy()
        constants.update({
            "MLLM_VENDOR": "vertexai",
            "MLLM_MODEL": "gemini-live-2.5-flash-preview-native-audio-09-2025",
            "MLLM_ADC_CREDENTIALS_STRING": "",
            "MLLM_PROJECT_ID": "",
            "MLLM_LOCATION": "us-central1",
            "MLLM_TRANSCRIBE_AGENT": None,
            "MLLM_TRANSCRIBE_USER": None,
            "DEFAULT_PROMPT": "You are a helpful assistant",
            "DEFAULT_GREETING": "Hello",
            "DEFAULT_FAILURE_MESSAGE": "Error",
        })

        config = build_mllm_config(constants)

        assert config["vendor"] == "vertexai"
        assert config["params"]["transcribe_agent"] is True
        assert config["params"]["transcribe_user"] is True


@pytest.mark.unit
class TestCreateAgentPayload:
    """Tests for create_agent_payload function"""

    def test_basic_payload_structure(self, test_constants):
        """Test basic agent payload structure"""
        # Add required constants
        constants = test_constants.copy()
        constants.update({
            "LLM_URL": "https://api.openai.com/v1/chat/completions",
            "DEFAULT_PROMPT": "You are a helpful assistant",
            "DEFAULT_GREETING": "Hello",
            "DEFAULT_FAILURE_MESSAGE": "Sorry, I encountered an error",
            "MAX_HISTORY": 10,
            "IDLE_TIMEOUT": 300,
            "VAD_SILENCE_DURATION_MS": "500",
            "ENABLE_AIVAD": "false",
            "ASR_VENDOR": "ares",
            "ASR_LANGUAGE": "en-US",
            "AVATAR_VENDOR": ""
        })

        payload = create_agent_payload(
            channel="test_channel",
            constants=constants,
            query_params={},
            agent_video_token="test_token"
        )

        # Check required fields
        assert "name" in payload
        assert payload["name"] == "test_channel"
        assert "properties" in payload
        assert "tts" in payload["properties"]
        assert "llm" in payload["properties"]
        assert "asr" in payload["properties"]
        assert payload["properties"]["parameters"]["transcript"]["enable"] is True

    def test_payload_with_avatar(self, test_constants):
        """Test payload includes avatar when vendor is set"""
        constants = test_constants.copy()
        constants.update({
            "LLM_URL": "https://api.openai.com/v1/chat/completions",
            "DEFAULT_PROMPT": "You are a helpful assistant",
            "DEFAULT_GREETING": "Hello",
            "DEFAULT_FAILURE_MESSAGE": "Error",
            "MAX_HISTORY": 10,
            "IDLE_TIMEOUT": 300,
            "VAD_SILENCE_DURATION_MS": "500",
            "ENABLE_AIVAD": "false",
            "ASR_VENDOR": "ares",
            "ASR_LANGUAGE": "en-US",
            "AVATAR_VENDOR": "heygen",
            "AVATAR_API_KEY": "test_key",
            "AVATAR_ID": "test_avatar",
            "HEYGEN_QUALITY": "high",
            "HEYGEN_ACTIVITY_IDLE_TIMEOUT": 60
        })

        payload = create_agent_payload(
            channel="test_channel",
            constants=constants,
            query_params={},
            agent_video_token="video_token_here"
        )

        assert "avatar" in payload["properties"]
        assert payload["properties"]["avatar"]["vendor"] == "heygen"

    def test_payload_missing_tts_vendor(self, test_constants):
        """Test that missing TTS_VENDOR raises error"""
        constants = test_constants.copy()
        constants["TTS_VENDOR"] = ""
        constants.update({
            "LLM_URL": "https://api.openai.com/v1/chat/completions",
            "DEFAULT_PROMPT": "You are a helpful assistant",
            "DEFAULT_GREETING": "Hello",
            "DEFAULT_FAILURE_MESSAGE": "Error",
            "MAX_HISTORY": 10,
            "IDLE_TIMEOUT": 300,
            "VAD_SILENCE_DURATION_MS": "500",
            "ENABLE_AIVAD": "false",
            "ASR_VENDOR": "ares",
            "ASR_LANGUAGE": "en-US",
            "AVATAR_VENDOR": ""
        })

        with pytest.raises(ValueError, match="TTS_VENDOR must be set"):
            create_agent_payload(
                channel="test_channel",
                constants=constants,
                query_params={},
                agent_video_token=""
            )

    def test_heygen_missing_api_key(self, test_constants):
        """Test that HeyGen without API key raises error"""
        constants = test_constants.copy()
        constants.update({
            "LLM_URL": "https://api.openai.com/v1/chat/completions",
            "DEFAULT_PROMPT": "You are a helpful assistant",
            "DEFAULT_GREETING": "Hello",
            "DEFAULT_FAILURE_MESSAGE": "Error",
            "MAX_HISTORY": 10,
            "IDLE_TIMEOUT": 300,
            "VAD_SILENCE_DURATION_MS": "500",
            "ENABLE_AIVAD": "false",
            "ASR_VENDOR": "ares",
            "ASR_LANGUAGE": "en-US",
            "AVATAR_VENDOR": "heygen",
            "AVATAR_API_KEY": "",  # Missing
            "AVATAR_ID": "test_avatar",
            "HEYGEN_QUALITY": "high",
            "HEYGEN_ACTIVITY_IDLE_TIMEOUT": 60
        })

        with pytest.raises(ValueError, match="AVATAR_API_KEY is required"):
            create_agent_payload(
                channel="test_channel",
                constants=constants,
                query_params={},
                agent_video_token="video_token"
            )

    def test_heygen_missing_avatar_id(self, test_constants):
        """Test that HeyGen without avatar ID raises error"""
        constants = test_constants.copy()
        constants.update({
            "LLM_URL": "https://api.openai.com/v1/chat/completions",
            "DEFAULT_PROMPT": "You are a helpful assistant",
            "DEFAULT_GREETING": "Hello",
            "DEFAULT_FAILURE_MESSAGE": "Error",
            "MAX_HISTORY": 10,
            "IDLE_TIMEOUT": 300,
            "VAD_SILENCE_DURATION_MS": "500",
            "ENABLE_AIVAD": "false",
            "ASR_VENDOR": "ares",
            "ASR_LANGUAGE": "en-US",
            "AVATAR_VENDOR": "heygen",
            "AVATAR_API_KEY": "test_key",
            "AVATAR_ID": "",  # Missing
            "HEYGEN_QUALITY": "high",
            "HEYGEN_ACTIVITY_IDLE_TIMEOUT": 60
        })

        with pytest.raises(ValueError, match="AVATAR_ID is required"):
            create_agent_payload(
                channel="test_channel",
                constants=constants,
                query_params={},
                agent_video_token="video_token"
            )

    def test_anam_missing_api_key(self, test_constants):
        """Test that Anam without API key raises error"""
        constants = test_constants.copy()
        constants.update({
            "LLM_URL": "https://api.openai.com/v1/chat/completions",
            "DEFAULT_PROMPT": "You are a helpful assistant",
            "DEFAULT_GREETING": "Hello",
            "DEFAULT_FAILURE_MESSAGE": "Error",
            "MAX_HISTORY": 10,
            "IDLE_TIMEOUT": 300,
            "VAD_SILENCE_DURATION_MS": "500",
            "ENABLE_AIVAD": "false",
            "ASR_VENDOR": "ares",
            "ASR_LANGUAGE": "en-US",
            "AVATAR_VENDOR": "anam",
            "AVATAR_API_KEY": "",  # Missing
            "AVATAR_ID": "test_avatar",
            "ANAM_AGENT_ENDPOINT": "https://test.endpoint.com"
        })

        with pytest.raises(ValueError, match="AVATAR_API_KEY is required"):
            create_agent_payload(
                channel="test_channel",
                constants=constants,
                query_params={},
                agent_video_token="video_token"
            )

    def test_anam_missing_avatar_id(self, test_constants):
        """Test that Anam without avatar ID raises error"""
        constants = test_constants.copy()
        constants.update({
            "LLM_URL": "https://api.openai.com/v1/chat/completions",
            "DEFAULT_PROMPT": "You are a helpful assistant",
            "DEFAULT_GREETING": "Hello",
            "DEFAULT_FAILURE_MESSAGE": "Error",
            "MAX_HISTORY": 10,
            "IDLE_TIMEOUT": 300,
            "VAD_SILENCE_DURATION_MS": "500",
            "ENABLE_AIVAD": "false",
            "ASR_VENDOR": "ares",
            "ASR_LANGUAGE": "en-US",
            "AVATAR_VENDOR": "anam",
            "AVATAR_API_KEY": "test_key",
            "AVATAR_ID": "",  # Missing
            "ANAM_AGENT_ENDPOINT": "https://test.endpoint.com"
        })

        with pytest.raises(ValueError, match="AVATAR_ID is required"):
            create_agent_payload(
                channel="test_channel",
                constants=constants,
                query_params={},
                agent_video_token="video_token"
            )

    def test_generic_avatar_payload(self, test_constants):
        """Test payload includes generic avatar with all expected params"""
        constants = test_constants.copy()
        constants.update({
            "LLM_URL": "https://api.openai.com/v1/chat/completions",
            "DEFAULT_PROMPT": "You are a helpful assistant",
            "DEFAULT_GREETING": "Hello",
            "DEFAULT_FAILURE_MESSAGE": "Error",
            "MAX_HISTORY": 10,
            "IDLE_TIMEOUT": 300,
            "VAD_SILENCE_DURATION_MS": "500",
            "ENABLE_AIVAD": "false",
            "ASR_VENDOR": "ares",
            "ASR_LANGUAGE": "en-US",
            "AVATAR_VENDOR": "generic",
            "AVATAR_API_KEY": "test_key",
            "AVATAR_ID": "https://example.com/avatar.jpg",
            "AVATAR_API_BASE_URL": "https://example.com/api/liveai/agora",
            "AVATAR_QUALITY": "high",
            "AVATAR_VERSION": "v1",
            "AVATAR_VIDEO_ENCODING": "H264",
            "AVATAR_ACTIVITY_IDLE_TIMEOUT": "120",
            "AVATAR_AREA": "NORTH_AMERICA",
        })

        payload = create_agent_payload(
            channel="test_channel",
            constants=constants,
            query_params={},
            agent_video_token="video_token_here"
        )

        assert "avatar" in payload["properties"]
        avatar = payload["properties"]["avatar"]
        assert avatar["vendor"] == "generic"
        assert avatar["enable"] is True
        assert avatar["params"]["api_key"] == "test_key"
        assert avatar["params"]["avatar_id"] == "https://example.com/avatar.jpg"
        assert avatar["params"]["api_base_url"] == "https://example.com/api/liveai/agora"
        assert avatar["params"]["quality"] == "high"
        assert avatar["params"]["version"] == "v1"
        assert avatar["params"]["video_encoding"] == "H264"
        assert avatar["params"]["activity_idle_timeout"] == 120
        assert avatar["params"]["area"] == "NORTH_AMERICA"

    def test_generic_missing_api_key(self, test_constants):
        """Test that generic without API key raises error"""
        constants = test_constants.copy()
        constants.update({
            "LLM_URL": "https://api.openai.com/v1/chat/completions",
            "DEFAULT_PROMPT": "You are a helpful assistant",
            "DEFAULT_GREETING": "Hello",
            "DEFAULT_FAILURE_MESSAGE": "Error",
            "MAX_HISTORY": 10,
            "IDLE_TIMEOUT": 300,
            "VAD_SILENCE_DURATION_MS": "500",
            "ENABLE_AIVAD": "false",
            "ASR_VENDOR": "ares",
            "ASR_LANGUAGE": "en-US",
            "AVATAR_VENDOR": "generic",
            "AVATAR_API_KEY": "",  # Missing
            "AVATAR_ID": "https://example.com/avatar.jpg",
            "AVATAR_API_BASE_URL": "https://example.com/api/liveai/agora",
        })

        with pytest.raises(ValueError, match="AVATAR_API_KEY is required"):
            create_agent_payload(
                channel="test_channel",
                constants=constants,
                query_params={},
                agent_video_token="video_token"
            )

    def test_anam_avatar_id_query_override(self, test_constants):
        """Test that Anam avatar_id can be overridden via query params"""
        constants = test_constants.copy()
        constants.update({
            "LLM_URL": "https://api.openai.com/v1/chat/completions",
            "DEFAULT_PROMPT": "You are a helpful assistant",
            "DEFAULT_GREETING": "Hello",
            "DEFAULT_FAILURE_MESSAGE": "Error",
            "MAX_HISTORY": 10,
            "IDLE_TIMEOUT": 300,
            "VAD_SILENCE_DURATION_MS": "500",
            "ENABLE_AIVAD": "false",
            "ASR_VENDOR": "ares",
            "ASR_LANGUAGE": "en-US",
            "AVATAR_VENDOR": "anam",
            "AVATAR_API_KEY": "test_key",
            "AVATAR_ID": "default_avatar",
        })

        payload = create_agent_payload(
            channel="test_channel",
            constants=constants,
            query_params={"avatar_id": "override_avatar"},
            agent_video_token="video_token_here"
        )

        assert payload["properties"]["avatar"]["vendor"] == "anam"
        assert payload["properties"]["avatar"]["params"]["avatar_id"] == "override_avatar"

    def test_generic_query_param_overrides(self, test_constants):
        """Test that generic avatar query params override profile defaults"""
        constants = test_constants.copy()
        constants.update({
            "LLM_URL": "https://api.openai.com/v1/chat/completions",
            "DEFAULT_PROMPT": "You are a helpful assistant",
            "DEFAULT_GREETING": "Hello",
            "DEFAULT_FAILURE_MESSAGE": "Error",
            "MAX_HISTORY": 10,
            "IDLE_TIMEOUT": 300,
            "VAD_SILENCE_DURATION_MS": "500",
            "ENABLE_AIVAD": "false",
            "ASR_VENDOR": "ares",
            "ASR_LANGUAGE": "en-US",
            "AVATAR_VENDOR": "generic",
            "AVATAR_API_KEY": "test_key",
            "AVATAR_ID": "https://example.com/default-avatar.jpg",
            "AVATAR_API_BASE_URL": "https://example.com/api/liveai/agora",
        })

        payload = create_agent_payload(
            channel="test_channel",
            constants=constants,
            query_params={
                "avatar_id": "https://example.com/override-avatar.jpg",
                "avatar_api_base_url": "https://override.example.com/agora",
            },
            agent_video_token="video_token_here"
        )

        avatar = payload["properties"]["avatar"]
        assert avatar["vendor"] == "generic"
        assert avatar["params"]["avatar_id"] == "https://example.com/override-avatar.jpg"
        assert avatar["params"]["api_base_url"] == "https://override.example.com/agora"

    def test_generic_missing_api_base_url(self, test_constants):
        """Test that generic without API base URL raises error"""
        constants = test_constants.copy()
        constants.update({
            "LLM_URL": "https://api.openai.com/v1/chat/completions",
            "DEFAULT_PROMPT": "You are a helpful assistant",
            "DEFAULT_GREETING": "Hello",
            "DEFAULT_FAILURE_MESSAGE": "Error",
            "MAX_HISTORY": 10,
            "IDLE_TIMEOUT": 300,
            "VAD_SILENCE_DURATION_MS": "500",
            "ENABLE_AIVAD": "false",
            "ASR_VENDOR": "ares",
            "ASR_LANGUAGE": "en-US",
            "AVATAR_VENDOR": "generic",
            "AVATAR_API_KEY": "test_key",
            "AVATAR_ID": "https://example.com/avatar.jpg",
            "AVATAR_API_BASE_URL": "",
        })

        with pytest.raises(ValueError, match="AVATAR_API_BASE_URL is required"):
            create_agent_payload(
                channel="test_channel",
                constants=constants,
                query_params={},
                agent_video_token="video_token"
            )

    def test_xai_mllm_payload_with_avatar_and_semantic_turn_detection(self, test_constants):
        """Test xAI MLLM payload shape for LemonSlice avatar profile"""
        constants = test_constants.copy()
        constants.update({
            "ENABLE_MLLM": "true",
            "MLLM_VENDOR": "xai",
            "MLLM_URL": "wss://api.x.ai/v1/realtime",
            "MLLM_API_KEY": "test_xai_key",
            "MLLM_VOICE": "eve",
            "MLLM_LANGUAGE": "en",
            "MLLM_SAMPLE_RATE": "24000",
            "DEFAULT_PROMPT": "You are a helpful assistant",
            "DEFAULT_GREETING": "Hello",
            "DEFAULT_FAILURE_MESSAGE": "Error",
            "AVATAR_VENDOR": "generic",
            "AVATAR_API_KEY": "test_avatar_key",
            "AVATAR_ID": "https://example.com/avatar.jpg",
            "AVATAR_API_BASE_URL": "https://example.com/api/liveai/agora",
            "TURN_DETECTION_START_OF_SPEECH_MODE": "semantic",
            "TURN_DETECTION_END_OF_SPEECH_MODE": "semantic",
        })

        payload = create_agent_payload(
            channel="test_channel",
            constants=constants,
            query_params={},
            agent_video_token="video_token_here"
        )

        properties = payload["properties"]
        assert "mllm" in properties
        assert "llm" not in properties
        assert "tts" not in properties
        assert properties["mllm"]["vendor"] == "xai"
        assert properties["avatar"]["vendor"] == "generic"
        # Legacy top-level turn_detection is suppressed in MLLM mode; only
        # mllm.turn_detection is emitted (and it's what the engine actually uses).
        assert "turn_detection" not in properties
        assert properties["mllm"]["turn_detection"]["mode"] == "server_vad"
