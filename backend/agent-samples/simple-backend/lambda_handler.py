"""
AWS Lambda handler for Agora Conversational AI

This is a thin wrapper that:
1. Extracts parameters from Lambda event
2. Calls core business logic
3. Returns Lambda-formatted response
"""

import logging

from core.config import initialize_constants
from core.tokens import build_token_with_rtm
from core.agent import create_agent_payload, send_agent_to_channel, hangup_agent
from core.utils import generate_random_channel, json_response
from x.profile_prompt import XApiError, build_profile_overrides_from_handle

logger = logging.getLogger(__name__)


def lambda_handler(event, context):
    """
    Lambda handler function that processes incoming requests.

    Supports:
    - Token generation only (connect=false)
    - Agent join with token generation (connect=true, default)
    - Agent hangup (hangup=true&agent_id=xxx)
    - Debug mode (debug in query params)
    - Profile support (profile=xxx for env var overrides)
    """
    # Get query parameters
    query_params = event.get('queryStringParameters') or {}

    # Get optional profile parameter
    profile = query_params.get('profile')

    # Initialize constants with profile
    constants = initialize_constants(profile)

    # Handle hangup request
    if query_params.get('hangup', '').lower() == 'true':
        if 'agent_id' not in query_params:
            return json_response(400, {"error": "Missing agent_id parameter for hangup"})

        agent_id = query_params['agent_id']
        hangup_response = hangup_agent(agent_id, constants)

        return json_response(200, {
            "agent_response": hangup_response
        })

    # Get or generate channel
    channel = query_params.get('channel') or generate_random_channel(10)

    # Check if token-only mode
    token_only_mode = query_params.get('connect', 'true').lower() == 'false'

    # Check if we have APP_CERTIFICATE for token generation
    has_certificate = bool(constants["APP_CERTIFICATE"] and constants["APP_CERTIFICATE"].strip())

    # Generate tokens
    if has_certificate:
        user_token_data = build_token_with_rtm(channel, constants["USER_UID"], constants)
        agent_video_token_data = build_token_with_rtm(channel, constants["AGENT_VIDEO_UID"], constants)
    else:
        user_token_data = {"token": constants["APP_ID"], "uid": constants["USER_UID"]}
        agent_video_token_data = {"token": constants["APP_ID"], "uid": constants["AGENT_VIDEO_UID"]}

    # Token-only mode response
    if token_only_mode:
        return json_response(200, {
            "audio_scenario": "10",
            "token": user_token_data["token"],
            "uid": user_token_data["uid"],
            "channel": channel,
            "appid": constants["APP_ID"],
            "user_token": user_token_data,
            "agent_video_token": agent_video_token_data,
            "agent": {
                "uid": constants["AGENT_UID"]
            },
            "agent_rtm_uid": str(constants["AGENT_UID"]),
            "enable_string_uid": False,
            "token_generation_method": "v007 tokens with RTC+RTM services" if has_certificate else "APP_ID only (no APP_CERTIFICATE)",
            "agent_response": {
                "status_code": 200,
                "response": {"message": "Token-only mode: tokens generated successfully", "mode": "token_only", "connect": False},
                "success": True
            }
        })

    xhandle = (query_params.get("xhandle") or "").strip()
    if xhandle:
        try:
            overrides = build_profile_overrides_from_handle(
                xhandle,
                bearer_token=constants.get("X_API_BEARER_TOKEN"),
                timeout_seconds=float(constants.get("X_API_TIMEOUT_SECONDS", "8")),
            )
        except XApiError as exc:
            logger.warning("xhandle '%s' fetch failed, falling back to profile defaults: %s", xhandle, exc)
            overrides = None
        if overrides:
            if overrides.get("prompt"):
                query_params["prompt"] = overrides["prompt"]
            if overrides.get("greeting"):
                query_params["greeting"] = overrides["greeting"]
            if overrides.get("avatar_id"):
                query_params["avatar_id"] = overrides["avatar_id"]

    # Normal flow: create and send agent
    try:
        agent_payload = create_agent_payload(
            channel=channel,
            constants=constants,
            query_params=query_params,
            agent_video_token=agent_video_token_data["token"]
        )
    except ValueError as e:
        return json_response(400, {"error": str(e)})

    # Send agent to channel
    agent_response = send_agent_to_channel(channel, agent_payload, constants)

    # Build response
    response_data = {
        "audio_scenario": "10",
        "token": user_token_data["token"],
        "uid": user_token_data["uid"],
        "channel": channel,
        "appid": constants["APP_ID"],
        "user_token": user_token_data,
        "agent_video_token": agent_video_token_data,
        "agent": {
            "uid": constants["AGENT_UID"]
        },
        "agent_rtm_uid": str(constants["AGENT_UID"]),
        "enable_string_uid": False,
        "agent_response": agent_response
    }

    # Add debug info if requested
    if 'debug' in query_params:
        response_data["debug"] = {
            "agent_payload": agent_payload,
            "channel": channel,
            "api_url": f"{constants.get('AGENT_ENDPOINT', 'https://api.agora.io/api/conversational-ai-agent/v2/projects')}/{constants['APP_ID']}/join",
            "token_generation_method": "v007 tokens with RTC+RTM services" if has_certificate else "APP_ID only (no APP_CERTIFICATE)",
            "has_app_certificate": has_certificate
        }

    return json_response(200, response_data)
