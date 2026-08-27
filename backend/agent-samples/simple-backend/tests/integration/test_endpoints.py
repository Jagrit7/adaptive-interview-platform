"""Integration tests for Flask endpoints"""

import pytest
import responses
import json


@pytest.mark.integration
class TestStartAgentEndpoint:
    """Tests for /start-agent endpoint"""

    @responses.activate
    def test_start_agent_with_channel(self, client):
        """Test /start-agent with explicit channel parameter"""
        # Mock the Agora API response
        responses.add(
            responses.POST,
            "https://api.agora.io/v1/projects/test_app_id/join",
            json={"status": "success", "agent_id": "test_agent_123"},
            status=200
        )

        response = client.get('/start-agent?channel=test_channel&connect=false')

        assert response.status_code == 200
        data = response.json

        # Verify response structure
        assert 'token' in data
        assert 'uid' in data
        assert 'channel' in data
        assert 'appid' in data
        assert 'agent_response' in data

        # Verify channel name
        assert data['channel'] == 'test_channel'

    def test_start_agent_auto_channel(self, client):
        """Test /start-agent auto-generates channel when not provided"""
        response = client.get('/start-agent?connect=false')

        assert response.status_code == 200
        data = response.json

        # Should have auto-generated channel
        assert 'channel' in data
        assert len(data['channel']) == 10
        assert data['channel'].isalnum()

    def test_token_only_mode(self, client):
        """Test connect=false returns tokens without starting agent"""
        response = client.get('/start-agent?connect=false')

        assert response.status_code == 200
        data = response.json

        # Verify token-only response
        assert data['agent_response']['response']['mode'] == 'token_only'
        assert data['agent_response']['response']['connect'] is False
        assert data['agent_response']['success'] is True
        assert data['session_id']

    def test_start_agent_preserves_supplied_session_id(self, client):
        response = client.get('/start-agent?connect=false&session_id=sess-demo-123')

        assert response.status_code == 200
        assert response.json['session_id'] == 'sess-demo-123'

    def test_start_agent_response_structure(self, client):
        """Test that response has all required fields"""
        response = client.get('/start-agent?connect=false')
        data = response.json

        # Required fields
        required_fields = [
            'audio_scenario',
            'token',
            'uid',
            'channel',
            'appid',
            'user_token',
            'agent_video_token',
            'agent',
            'agent_rtm_uid',
            'enable_string_uid',
            'agent_response'
        ]

        for field in required_fields:
            assert field in data, f"Missing required field: {field}"

    def test_start_agent_xhandle_overrides_prompt_and_greeting(self, client, monkeypatch):
        captured = {}

        monkeypatch.setattr(
            "local_server.build_profile_overrides_from_handle",
            lambda handle, bearer_token, timeout_seconds: {
                "prompt": "Prompt from X",
                "greeting": "Greeting from X",
                "avatar_id": "https://example.com/avatar.jpg",
            },
        )

        def fake_create_agent_payload(channel, constants, query_params, agent_video_token):
            captured["prompt"] = query_params["prompt"]
            captured["greeting"] = query_params["greeting"]
            captured["avatar_id"] = query_params["avatar_id"]
            return {"name": channel, "properties": {}}

        monkeypatch.setattr("local_server.create_agent_payload", fake_create_agent_payload)
        monkeypatch.setattr(
            "local_server.send_agent_to_channel",
            lambda channel, agent_payload, constants: {
                "status_code": 200,
                "response": "{\"agent_id\":\"agent-123\",\"status\":\"RUNNING\"}",
                "success": True,
            },
        )

        response = client.get(
            "/start-agent?channel=testx&xhandle=paulg&prompt=userprompt&greeting=usergreeting"
        )

        assert response.status_code == 200
        assert captured["prompt"] == "Prompt from X"
        assert captured["greeting"] == "Greeting from X"
        assert captured["avatar_id"] == "https://example.com/avatar.jpg"

    def test_start_agent_token_only_does_not_resolve_xhandle(self, client, monkeypatch):
        called = {"value": False}

        def fake_build_profile_overrides_from_handle(handle, bearer_token, timeout_seconds):
            called["value"] = True
            return {}

        monkeypatch.setattr(
            "local_server.build_profile_overrides_from_handle",
            fake_build_profile_overrides_from_handle,
        )

        response = client.get('/start-agent?connect=false&xhandle=paulg')

        assert response.status_code == 200
        assert called["value"] is False

    def test_start_agent_includes_scheduled_meeting_signal_flags(self, client, monkeypatch):
        monkeypatch.setattr(
            "local_server.fetch_dashboard_meeting_signals",
            lambda constants, meeting_id: {
                "status": "resolved",
                "meeting_id": meeting_id,
                "meeting_type": "ai",
                "transcription_enabled": True,
                "audio_biomarkers_enabled": True,
                "video_biomarkers_enabled": False,
            },
        )

        response = client.get('/start-agent?connect=false&scheduled_meeting_id=meeting-123')

        assert response.status_code == 200
        data = response.json
        assert data["transcription_enabled"] is True
        assert data["audio_biomarkers_enabled"] is True
        assert data["video_biomarkers_enabled"] is False


@pytest.mark.integration
class TestHangupAgentEndpoint:
    """Tests for /hangup-agent endpoint"""

    @responses.activate
    def test_hangup_agent_success(self, client):
        """Test /hangup-agent with valid agent_id"""
        # Mock the Agora API response
        responses.add(
            responses.DELETE,
            "https://api.agora.io/v1/projects/test_app_id/test_agent_123",
            json={"status": "success"},
            status=200
        )

        response = client.get('/hangup-agent?agent_id=test_agent_123')

        assert response.status_code == 200
        data = response.json
        assert 'agent_response' in data

    def test_hangup_agent_missing_id(self, client):
        """Test /hangup-agent returns error without agent_id"""
        response = client.get('/hangup-agent')

        assert response.status_code == 400
        data = response.json
        assert 'error' in data
        assert 'agent_id' in data['error']


@pytest.mark.integration
class TestHealthEndpoint:
    """Tests for /health endpoint"""

    def test_health_check(self, client):
        """Test health endpoint returns OK"""
        response = client.get('/health')

        assert response.status_code == 200
        data = response.json

        assert data['status'] == 'ok'
        assert 'service' in data
