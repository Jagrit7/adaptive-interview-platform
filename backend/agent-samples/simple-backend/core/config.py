"""
Configuration and environment variable management with profile support
"""

import os


def get_env_var(var_name, profile=None, default_value=None):
    """
    Gets an environment variable with profile support.
    If profile is provided, it ONLY checks for PROFILE_VAR_NAME (no fallback).
    If that doesn't exist, it returns the default_value.
    If no profile is provided, it checks VAR_NAME.

    Args:
        var_name: The environment variable name
        profile: Optional profile prefix (uppercased automatically)
        default_value: Default value if variable doesn't exist

    Returns:
        The value of the environment variable or default_value
    """
    if profile:
        profiled_var_name = f"{profile.upper()}_{var_name}"
        profiled_value = os.environ.get(profiled_var_name)
        if profiled_value is not None:
            return profiled_value
        # No fallback to base variable when profile is specified
        return default_value

    value = os.environ.get(var_name)
    if value is not None:
        return value

    return default_value


PROFILE_FALLBACK = os.environ.get("PROFILE_FALLBACK", "PHOTO_GEMINI")


def initialize_constants(profile=None):
    """
    Initialize all constants with profile support and sensible defaults.

    If the requested profile has no APP_ID (i.e. there's no `{PROFILE}_APP_ID`
    in `.env`), fall back to PROFILE_FALLBACK so ad-hoc profile names (e.g.
    fresh photo-demo gallery names) inherit working agent config without the
    operator having to add a matching env block.

    Args:
        profile: Optional profile suffix for environment variables

    Returns:
        Dictionary of constants
    """
    if profile and not get_env_var('APP_ID', profile):
        print(f"[Profile] '{profile}' has no APP_ID; using fallback profile '{PROFILE_FALLBACK}'", flush=True)
        profile = PROFILE_FALLBACK

    constants = {
        # Store profile name for debugging/logging
        "PROFILE_NAME": profile if profile else "default",

        # Required Agora settings (no defaults)
        "APP_ID": get_env_var('APP_ID', profile),
        "APP_CERTIFICATE": get_env_var('APP_CERTIFICATE', profile, ''),
        "AGENT_AUTH_HEADER": get_env_var('AGENT_AUTH_HEADER', profile),
        "AGENT_ENDPOINT": get_env_var('AGENT_ENDPOINT', profile,
            "https://api.agora.io/api/conversational-ai-agent/v2/projects"),

        # Fixed UIDs
        "AGENT_UID": "100",
        "USER_UID": "101",
        "AGENT_VIDEO_UID": "102",

        # Token expiration (in seconds)
        "TOKEN_EXPIRE": 24 * 3600,  # 24 hours
        "PRIVILEGE_EXPIRE": 24 * 3600,  # 24 hours

        # LLM settings
        "LLM_URL": get_env_var('LLM_URL', profile, "https://api.openai.com/v1/chat/completions"),
        "AGENT_SERVER_URL": get_env_var('AGENT_SERVER_URL', profile),
        "LLM_API_KEY": get_env_var('LLM_API_KEY', profile),
        "LLM_MODEL": get_env_var('LLM_MODEL', profile, "gpt-4o-mini"),
        "LLM_STYLE": get_env_var('LLM_STYLE', profile, "openai"),
        "LLM_VENDOR": get_env_var('LLM_VENDOR', profile),
        "GREETING_MODE": get_env_var('GREETING_MODE', profile),

        # TTS settings (vendor required, no default)
        "TTS_VENDOR": get_env_var('TTS_VENDOR', profile),
        "TTS_KEY": get_env_var('TTS_KEY', profile),
        # TTS_VOICE_ID - universal voice identifier for all vendors
        # Falls back to vendor-specific env vars for backward compatibility
        "TTS_VOICE_ID": (
            get_env_var('TTS_VOICE_ID', profile) or
            get_env_var('RIME_SPEAKER', profile) or
            get_env_var('OPENAI_TTS_VOICE', profile) or
            get_env_var('CARTESIA_VOICE_ID', profile)
        ),
        "TTS_SAMPLE_RATE": get_env_var('TTS_SAMPLE_RATE', profile, "24000"),
        "TTS_SPEED": get_env_var('TTS_SPEED', profile, "1.0"),
        # TTS skip_patterns — comma-separated bracket type IDs to skip in TTS output
        # 1=（）  2=【】  3=()  4=[]  5={}
        "TTS_SKIP_PATTERNS": get_env_var('TTS_SKIP_PATTERNS', profile),

        # ElevenLabs specific defaults
        "ELEVENLABS_MODEL": get_env_var('ELEVENLABS_MODEL', profile, "eleven_flash_v2_5"),
        "ELEVENLABS_STABILITY": get_env_var('ELEVENLABS_STABILITY', profile, "0.5"),
        # Optional ElevenLabs speech rate (0.7 slow … 1.2 fast). Left
        # unset by default so the model uses its own default.
        "ELEVENLABS_SPEED": get_env_var('ELEVENLABS_SPEED', profile),

        # OpenAI TTS specific defaults
        "OPENAI_TTS_MODEL": get_env_var('OPENAI_TTS_MODEL', profile, "tts-1"),

        # Cartesia specific defaults
        "CARTESIA_MODEL": get_env_var('CARTESIA_MODEL', profile, "sonic-3"),

        # Rime TTS specific settings
        "RIME_MODEL_ID": get_env_var('RIME_MODEL_ID', profile, "mistv2"),
        "RIME_LANG": get_env_var('RIME_LANG', profile, "eng"),
        "RIME_SAMPLING_RATE": get_env_var('RIME_SAMPLING_RATE', profile, "16000"),
        "RIME_SPEED_ALPHA": get_env_var('RIME_SPEED_ALPHA', profile, "1.0"),

        # ASR settings (default to ares - no API key needed)
        "ASR_VENDOR": get_env_var('ASR_VENDOR', profile, "ares"),
        "ASR_LANGUAGE": get_env_var('ASR_LANGUAGE', profile, "en-US"),

        # Deepgram specific settings (if using deepgram ASR)
        "DEEPGRAM_KEY": get_env_var('DEEPGRAM_KEY', profile),
        "DEEPGRAM_MODEL": get_env_var('DEEPGRAM_MODEL', profile, "nova-3"),
        "DEEPGRAM_LANGUAGE": get_env_var('DEEPGRAM_LANGUAGE', profile, "en"),
        "DEEPGRAM_EAGER_EOT_THRESHOLD": get_env_var('DEEPGRAM_EAGER_EOT_THRESHOLD', profile, "0.6"),
        "DEEPGRAM_EOT_THRESHOLD": get_env_var('DEEPGRAM_EOT_THRESHOLD', profile, "0.8"),
        "DEEPGRAM_EOT_TIMEOUT_MS": get_env_var('DEEPGRAM_EOT_TIMEOUT_MS', profile, "700"),

        # VAD settings
        "VAD_SILENCE_DURATION_MS": get_env_var('VAD_SILENCE_DURATION_MS', profile, ""),
        "ENABLE_AIVAD": get_env_var('ENABLE_AIVAD', profile, "true"),

        # Agent settings
        "PIPELINE_ID": get_env_var('PIPELINE_ID', profile),
        "IDLE_TIMEOUT": get_env_var('IDLE_TIMEOUT', profile, "120"),
        "MAX_CALL_DURATION_SECONDS": get_env_var('MAX_CALL_DURATION_SECONDS', profile, "300"),
        "MAX_HISTORY": get_env_var('MAX_HISTORY', profile, "32"),

        # SAL (Selective Attention Locking) — beta, off by default
        "ENABLE_SAL": get_env_var('ENABLE_SAL', profile, "false"),

        # Audio scenario
        "ENABLE_AUDIO_CHORUS": get_env_var('ENABLE_AUDIO_CHORUS', profile, "false"),

        # Latency optimization
        "EAGER_LLM_RESPONSE": get_env_var('EAGER_LLM_RESPONSE', profile, "false"),
        "EAGER_LLM_TRIGGER": get_env_var('EAGER_LLM_TRIGGER', profile, ""),
        "EAGER_TTS_RESPONSE": get_env_var('EAGER_TTS_RESPONSE', profile, "false"),

        # Debug settings
        "ENABLE_CURL_DUMP": get_env_var('ENABLE_CURL_DUMP', profile, "false"),

        # MLLM settings (Gemini Live multimodal LLM)
        "ENABLE_MLLM": get_env_var('ENABLE_MLLM', profile, "false"),
        "MLLM_VENDOR": get_env_var('MLLM_VENDOR', profile),
        "MLLM_STYLE": get_env_var('MLLM_STYLE', profile),
        "MLLM_API_KEY": get_env_var('MLLM_API_KEY', profile),
        "MLLM_URL": get_env_var('MLLM_URL', profile),
        "MLLM_MODEL": get_env_var('MLLM_MODEL', profile),
        "MLLM_ADC_CREDENTIALS_STRING": get_env_var('MLLM_ADC_CREDENTIALS_STRING', profile),
        "MLLM_PROJECT_ID": get_env_var('MLLM_PROJECT_ID', profile),
        "MLLM_LOCATION": get_env_var('MLLM_LOCATION', profile),
        "MLLM_VOICE": get_env_var('MLLM_VOICE', profile),
        "MLLM_LANGUAGE": get_env_var('MLLM_LANGUAGE', profile),
        "MLLM_SAMPLE_RATE": get_env_var('MLLM_SAMPLE_RATE', profile, "24000"),
        "MLLM_TRANSCRIBE_AGENT": get_env_var('MLLM_TRANSCRIBE_AGENT', profile),
        "MLLM_TRANSCRIBE_USER": get_env_var('MLLM_TRANSCRIBE_USER', profile),
        "MLLM_HISTORY_CONTENT": get_env_var('MLLM_HISTORY_CONTENT', profile),
        "TURN_DETECTION_TYPE": get_env_var('TURN_DETECTION_TYPE', profile),
        "TURN_DETECTION_START_OF_SPEECH_MODE": get_env_var('TURN_DETECTION_START_OF_SPEECH_MODE', profile),
        "TURN_DETECTION_END_OF_SPEECH_MODE": get_env_var('TURN_DETECTION_END_OF_SPEECH_MODE', profile),

        # Avatar settings (vendor-neutral)
        "AVATAR_VENDOR": get_env_var('AVATAR_VENDOR', profile),
        "AVATAR_API_KEY": get_env_var('AVATAR_API_KEY', profile),
        "AVATAR_ID": get_env_var('AVATAR_ID', profile),
        # Background fill used by the generic (LemonSlice) renderer to
        # composite the avatar against, e.g. "#006400" so the client
        # can chroma-key it out for transparency.
        "AVATAR_BACKGROUND_COLOR": get_env_var('AVATAR_BACKGROUND_COLOR', profile),
        # Optional aspect ratio hint for the generic renderer (e.g.
        # "1x1" for a square crop, "16x9" for landscape). When unset,
        # the renderer uses its default.
        "AVATAR_ASPECT_RATIO": get_env_var('AVATAR_ASPECT_RATIO', profile),

        # HeyGen specific settings (non-credential options)
        "HEYGEN_QUALITY": get_env_var('HEYGEN_QUALITY', profile, "high"),
        "HEYGEN_ACTIVITY_IDLE_TIMEOUT": get_env_var('HEYGEN_ACTIVITY_IDLE_TIMEOUT', profile, "120"),

        # Generic avatar settings
        "AVATAR_API_BASE_URL": get_env_var('AVATAR_API_BASE_URL', profile),
        "AVATAR_QUALITY": get_env_var('AVATAR_QUALITY', profile, "high"),
        "AVATAR_VERSION": get_env_var('AVATAR_VERSION', profile, "v1"),
        "AVATAR_VIDEO_ENCODING": get_env_var('AVATAR_VIDEO_ENCODING', profile, "H264"),
        "AVATAR_ACTIVITY_IDLE_TIMEOUT": get_env_var('AVATAR_ACTIVITY_IDLE_TIMEOUT', profile, "120"),
        "AVATAR_AREA": get_env_var('AVATAR_AREA', profile, "NORTH_AMERICA"),

        # Integration API keys (passed to custom LLM via register-agent)
        "THYMIA_API_KEY": get_env_var('THYMIA_API_KEY', profile),

        # X profile prompt enrichment
        "X_API_BEARER_TOKEN": get_env_var('X_API_BEARER_TOKEN', profile),
        "X_API_TIMEOUT_SECONDS": get_env_var('X_API_TIMEOUT_SECONDS', profile, "8"),

        # Auth settings (optional — omit to disable auth for this profile)
        "AUTH_JWT_SECRET": get_env_var('AUTH_JWT_SECRET', profile),
        "GOOGLE_CLIENT_ID": get_env_var('GOOGLE_CLIENT_ID', profile),
        "GOOGLE_CLIENT_SECRET": get_env_var('GOOGLE_CLIENT_SECRET', profile),
        "TWILIO_ACCOUNT_SID": get_env_var('TWILIO_ACCOUNT_SID', profile),
        "TWILIO_AUTH_TOKEN": get_env_var('TWILIO_AUTH_TOKEN', profile),
        "TWILIO_VERIFY_SERVICE_SID": get_env_var('TWILIO_VERIFY_SERVICE_SID', profile),
        "AUTH_BRAND_NAME": get_env_var('AUTH_BRAND_NAME', profile, "your session"),
        "ENCRYPTION_KEY": get_env_var('ENCRYPTION_KEY', profile),
        "AUTH_DATA_DIR": get_env_var('AUTH_DATA_DIR', profile, './data'),
        "MAX_SESSION_DURATION": get_env_var('MAX_SESSION_DURATION', profile),
        "ALLOWED_RETURN_ORIGINS": get_env_var('ALLOWED_RETURN_ORIGINS', profile),

        # Optional consultant-dashboard integration
        "CONSULTANT_DASHBOARD_URL": get_env_var('CONSULTANT_DASHBOARD_URL', profile),
        "CONSULTANT_DASHBOARD_INTERNAL_SHARED_SECRET": get_env_var('CONSULTANT_DASHBOARD_INTERNAL_SHARED_SECRET', profile),
        "AGENT_SERVER_SHARED_SECRET": get_env_var('AGENT_SERVER_SHARED_SECRET', profile),
        "CONSULTANT_DASHBOARD_TIMEOUT_SECONDS": get_env_var('CONSULTANT_DASHBOARD_TIMEOUT_SECONDS', profile, "5"),
        "REQUIRE_CONSULTANT_DASHBOARD_CLIENT": get_env_var('REQUIRE_CONSULTANT_DASHBOARD_CLIENT', profile, "false"),

        # MCP settings (JSON array of MCP server configs)
        "MCP_SERVERS": get_env_var('MCP_SERVERS', profile),

        # Default prompt and messages
        "DEFAULT_PROMPT": get_env_var('DEFAULT_PROMPT', profile,
            "You are a virtual companion. The user can both talk and type to you and you will be sent text. "
            "Say you can hear them if asked. They can also see you as a digital human. "
            "Keep responses to around 10 to 20 words or shorter. Be upbeat and try and keep conversation "
            "going by learning more about the user."),
        "DEFAULT_GREETING": get_env_var('DEFAULT_GREETING', profile, "hi there"),
        "DEFAULT_FAILURE_MESSAGE": get_env_var('DEFAULT_FAILURE_MESSAGE', profile, "Sorry, something went wrong"),
    }

    return constants
