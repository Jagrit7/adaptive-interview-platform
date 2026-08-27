import base64
import hashlib
import hmac
import json
import time
import unittest
from unittest.mock import patch

import jwt

import local_server
from core.meeting_mode import verify_join_bootstrap


def _signed_bootstrap(secret, payload):
    encoded = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    ).decode("ascii").rstrip("=")
    sig = hmac.new(secret.encode("utf-8"), encoded.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{encoded}.{sig}"


class MeetingModeTest(unittest.TestCase):
    def setUp(self):
        self.client = local_server.app.test_client()
        self.constants = {
            "APP_ID": "test-app",
            "APP_CERTIFICATE": "",
            "CONSULTANT_DASHBOARD_URL": "http://127.0.0.1:8090",
            "CONSULTANT_DASHBOARD_INTERNAL_SHARED_SECRET": "test-secret",
            "AGENT_SERVER_SHARED_SECRET": "agent-secret",
            "CONSULTANT_DASHBOARD_TIMEOUT_SECONDS": "5",
            "PROFILE_NAME": "therapy",
            "THYMIA_API_KEY": "thymia-key",
            "LLM_URL": "http://127.0.0.1:8101/chat/completions",
        }

    def test_verify_join_bootstrap_accepts_valid_token(self):
        token = _signed_bootstrap(
            "test-secret",
            {
                "meeting_id": "meeting-123",
                "consultant_id": "consultant-456",
                "participant_role": "host",
                "exp": int(time.time()) + 60,
            },
        )
        payload = verify_join_bootstrap("test-secret", token)
        self.assertEqual(payload["meeting_id"], "meeting-123")

    def _auth_header(self, user_id="user-hash-123"):
        token = jwt.encode(
            {
                "user_id": user_id,
                "name": "Alex Demo",
                "iat": int(time.time()),
                "exp": int(time.time()) + 300,
            },
            "test-jwt-secret",
            algorithm="HS256",
        )
        return {"Authorization": f"Bearer {token}"}

    def _auth_cookie(self, user_id="user-hash-123"):
        return jwt.encode(
            {
                "user_id": user_id,
                "name": "Alex Demo",
                "iat": int(time.time()),
                "exp": int(time.time()) + 300,
            },
            "test-jwt-secret",
            algorithm="HS256",
        )

    @patch("local_server._post_custom_llm_sync")
    @patch("local_server.build_token_with_rtm")
    @patch("local_server.authorize_meeting_join")
    @patch("local_server.initialize_constants")
    def test_join_meeting_authorizes_guest_and_returns_tokens(
        self,
        mocked_initialize_constants,
        mocked_authorize,
        mocked_build_token,
        mocked_post_custom_llm_sync,
    ):
        mocked_initialize_constants.return_value = self.constants
        mocked_post_custom_llm_sync.return_value = {"ok": True, "status": 200, "body": "{}"}
        mocked_authorize.return_value = {
            "ok": True,
            "data": {
                "meeting_id": "meeting-123",
                "meeting_runtime_key": "test-app:MEET123456:meeting-123",
                "participant_role": "guest",
                "client_id": "client-123",
                "consultant_id": "consultant-456",
                "channel_name": "MEET123456",
                "participant_uid": "101",
                "user_uid": "101",
                "host_uid": "103",
                "guest_uid": "101",
                "rtm_uid": "5001",
                "ensure_meeting_services": True,
                "transcription_enabled": True,
                "audio_biomarkers_enabled": False,
                "video_biomarkers_enabled": True,
                "transcription_provider": "agora_stt",
                "transcription_language": "en-US",
                "scheduled_start_at": "2026-04-20T10:00:00Z",
                "scheduled_end_at": "2026-04-20T10:30:00Z",
            },
        }
        mocked_build_token.side_effect = [
            {"token": "guest-token", "uid": "101"},
            {"token": "sub-token", "uid": "5000"},
            {"token": "rtm-token", "uid": "5001"},
            {"token": "stt-token", "uid": "104"},
        ]

        response = self.client.post(
            "/join-meeting",
            json={"profile": "therapy", "access_token": "client-access-token"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json["meeting_mode"])
        self.assertEqual(response.json["channel"], "MEET123456")
        self.assertEqual(response.json["uid"], "101")
        self.assertEqual(response.json["session_id"], "meeting-meeting-123")
        self.assertEqual(response.json["meeting_runtime_key"], "test-app:MEET123456:meeting-123")
        self.assertFalse(response.json["audio_biomarkers_enabled"])
        self.assertTrue(response.json["video_biomarkers_enabled"])
        mocked_post_custom_llm_sync.assert_called_once()
        register_payload = mocked_post_custom_llm_sync.call_args.args[1]
        self.assertEqual(register_payload["session_id"], "meeting-meeting-123")
        self.assertEqual(register_payload["meeting_runtime_key"], "test-app:MEET123456:meeting-123")
        self.assertTrue(register_payload["transcription_enabled"])
        self.assertFalse(register_payload["audio_biomarkers_enabled"])
        self.assertTrue(register_payload["video_biomarkers_enabled"])
        self.assertEqual(register_payload["transcription_provider"], "agora_stt")
        self.assertEqual(register_payload["transcription_language"], "en-US")
        self.assertEqual(register_payload["transcription_bot_uid"], "104")
        self.assertEqual(register_payload["transcription_bot_token"], "stt-token")
        self.assertEqual(
            mocked_post_custom_llm_sync.call_args.kwargs["constants"]["AGENT_SERVER_SHARED_SECRET"],
            "agent-secret",
        )

    @patch("local_server._post_custom_llm_sync")
    @patch("local_server.authorize_meeting_join")
    @patch("local_server.build_token_with_rtm")
    @patch("local_server.initialize_constants")
    def test_join_meeting_second_joiner_re_registers_enabled_services(
        self,
        mocked_initialize_constants,
        mocked_build_token,
        mocked_authorize,
        mocked_post_custom_llm_sync,
    ):
        mocked_initialize_constants.return_value = self.constants
        mocked_post_custom_llm_sync.return_value = {"ok": True, "status": 200, "body": "{}"}
        mocked_authorize.return_value = {
            "ok": True,
            "data": {
                "meeting_id": "meeting-123",
                "meeting_runtime_key": "test-app:MEET123456:meeting-123",
                "participant_role": "guest",
                "client_id": "client-123",
                "consultant_id": "consultant-456",
                "channel_name": "MEET123456",
                "participant_uid": "101",
                "user_uid": "101",
                "host_uid": "103",
                "guest_uid": "101",
                "rtm_uid": "5001",
                "ensure_meeting_services": False,
                "transcription_enabled": True,
                "audio_biomarkers_enabled": True,
                "video_biomarkers_enabled": False,
                "transcription_provider": "agora_stt",
                "transcription_language": "en-US",
            },
        }
        mocked_build_token.side_effect = [
            {"token": "guest-token", "uid": "101"},
            {"token": "sub-token", "uid": "5000"},
            {"token": "rtm-token", "uid": "5001"},
            {"token": "stt-token", "uid": "104"},
        ]

        response = self.client.post(
            "/join-meeting",
            json={"profile": "therapy", "access_token": "client-access-token"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json["transcription_enabled"])
        self.assertTrue(response.json["audio_biomarkers_enabled"])
        self.assertFalse(response.json["video_biomarkers_enabled"])
        mocked_post_custom_llm_sync.assert_called_once()
        register_payload = mocked_post_custom_llm_sync.call_args.args[1]
        self.assertTrue(register_payload["transcription_enabled"])
        self.assertTrue(register_payload["audio_biomarkers_enabled"])
        self.assertFalse(register_payload["video_biomarkers_enabled"])

    @patch("local_server._post_custom_llm_sync")
    @patch("local_server.authorize_meeting_join")
    @patch("local_server.build_token_with_rtm")
    @patch("local_server.initialize_constants")
    def test_join_meeting_second_joiner_accepts_register_conflict_as_reuse(
        self,
        mocked_initialize_constants,
        mocked_build_token,
        mocked_authorize,
        mocked_post_custom_llm_sync,
    ):
        mocked_initialize_constants.return_value = self.constants
        mocked_post_custom_llm_sync.return_value = {"ok": False, "status": 409, "body": "{}"}
        mocked_authorize.return_value = {
            "ok": True,
            "data": {
                "meeting_id": "meeting-123",
                "meeting_runtime_key": "test-app:MEET123456:meeting-123",
                "participant_role": "guest",
                "client_id": "client-123",
                "consultant_id": "consultant-456",
                "channel_name": "MEET123456",
                "participant_uid": "101",
                "user_uid": "101",
                "host_uid": "103",
                "guest_uid": "101",
                "rtm_uid": "5001",
                "ensure_meeting_services": False,
                "transcription_enabled": False,
                "audio_biomarkers_enabled": True,
                "video_biomarkers_enabled": True,
            },
        }
        mocked_build_token.side_effect = [
            {"token": "guest-token", "uid": "101"},
            {"token": "sub-token", "uid": "5000"},
            {"token": "rtm-token", "uid": "5001"},
        ]

        response = self.client.post(
            "/join-meeting",
            json={"profile": "therapy", "access_token": "client-access-token"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json["audio_biomarkers_enabled"])
        self.assertTrue(response.json["video_biomarkers_enabled"])
        self.assertEqual(mocked_post_custom_llm_sync.call_count, 3)

    @patch("local_server.initialize_constants")
    def test_join_meeting_guest_requires_authenticated_identity(self, mocked_initialize_constants):
        constants = dict(self.constants)
        constants["AUTH_JWT_SECRET"] = "test-jwt-secret"
        mocked_initialize_constants.return_value = constants

        response = self.client.post(
            "/join-meeting",
            json={"profile": "therapy", "access_token": "client-access-token"},
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json["error"], "Authentication required")

    @patch("local_server._post_custom_llm_sync")
    @patch("local_server.resolve_dashboard_client")
    @patch("local_server.build_token_with_rtm")
    @patch("local_server.authorize_meeting_join")
    @patch("local_server.initialize_constants")
    def test_join_meeting_guest_rejects_authenticated_wrong_client(
        self,
        mocked_initialize_constants,
        mocked_authorize,
        mocked_build_token,
        mocked_resolve_dashboard_client,
        mocked_post_custom_llm_sync,
    ):
        constants = dict(self.constants)
        constants["AUTH_JWT_SECRET"] = "test-jwt-secret"
        mocked_initialize_constants.return_value = constants
        mocked_post_custom_llm_sync.return_value = {"ok": True, "status": 200, "body": "{}"}
        mocked_authorize.return_value = {
            "ok": True,
            "data": {
                "meeting_id": "meeting-123",
                "meeting_runtime_key": "test-app:MEET123456:meeting-123",
                "participant_role": "guest",
                "client_id": "client-123",
                "consultant_id": "consultant-456",
                "channel_name": "MEET123456",
                "participant_uid": "101",
                "user_uid": "101",
                "host_uid": "103",
                "guest_uid": "101",
                "rtm_uid": "5001",
                "ensure_meeting_services": False,
            },
        }
        mocked_build_token.return_value = {"token": "guest-token", "uid": "101"}
        mocked_resolve_dashboard_client.return_value = {
            "status": "resolved",
            "client_id": "other-client",
        }

        response = self.client.post(
            "/join-meeting",
            json={"profile": "therapy", "access_token": "client-access-token"},
            headers=self._auth_header(),
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json["error"], "Authenticated account does not match this meeting.")

    @patch("local_server._post_custom_llm_sync")
    @patch("local_server.resolve_dashboard_client")
    @patch("local_server.build_token_with_rtm")
    @patch("local_server.authorize_meeting_join")
    @patch("local_server.initialize_constants")
    def test_join_meeting_guest_accepts_cookie_authenticated_identity(
        self,
        mocked_initialize_constants,
        mocked_authorize,
        mocked_build_token,
        mocked_resolve_dashboard_client,
        mocked_post_custom_llm_sync,
    ):
        constants = dict(self.constants)
        constants["AUTH_JWT_SECRET"] = "test-jwt-secret"
        mocked_initialize_constants.return_value = constants
        mocked_post_custom_llm_sync.return_value = {"ok": True, "status": 200, "body": "{}"}
        mocked_authorize.return_value = {
            "ok": True,
            "data": {
                "meeting_id": "meeting-123",
                "meeting_runtime_key": "test-app:MEET123456:meeting-123",
                "participant_role": "guest",
                "client_id": "client-123",
                "consultant_id": "consultant-456",
                "channel_name": "MEET123456",
                "participant_uid": "101",
                "user_uid": "101",
                "host_uid": "103",
                "guest_uid": "101",
                "rtm_uid": "5001",
                "ensure_meeting_services": False,
            },
        }
        mocked_build_token.side_effect = [
            {"token": "guest-token", "uid": "101"},
            {"token": "rtm-token", "uid": "5001"},
        ]
        mocked_resolve_dashboard_client.return_value = {
            "status": "resolved",
            "client_id": "client-123",
        }

        self.client.set_cookie("mindfix_client_auth", self._auth_cookie())
        response = self.client.post(
            "/join-meeting",
            json={"profile": "therapy", "access_token": "client-access-token"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["channel"], "MEET123456")

    @patch("local_server.notify_meeting_event")
    @patch("local_server.resolve_dashboard_client")
    @patch("local_server.authorize_meeting_join")
    @patch("local_server.initialize_constants")
    def test_meeting_participant_event_guest_requires_authenticated_identity(
        self,
        mocked_initialize_constants,
        mocked_authorize,
        mocked_resolve_dashboard_client,
        mocked_notify_event,
    ):
        constants = dict(self.constants)
        constants["AUTH_JWT_SECRET"] = "test-jwt-secret"
        mocked_initialize_constants.return_value = constants
        mocked_authorize.return_value = {
            "ok": True,
            "data": {
                "meeting_id": "meeting-123",
                "participant_role": "guest",
                "client_id": "client-123",
                "consultant_id": "consultant-456",
            },
        }
        mocked_resolve_dashboard_client.return_value = {
            "status": "resolved",
            "client_id": "client-123",
        }
        mocked_notify_event.return_value = {"ok": True}

        token = _signed_bootstrap(
            "test-secret",
            {
                "meeting_id": "meeting-123",
                "response_access_link_id": "link-123",
                "participant_role": "guest",
                "exp": int(time.time()) + 60,
            },
        )

        unauthenticated = self.client.post(
            "/meeting-participant-event",
            json={"profile": "therapy", "event": "joined", "join_bootstrap": token},
        )
        self.assertEqual(unauthenticated.status_code, 401)

        authenticated = self.client.post(
            "/meeting-participant-event",
            json={"profile": "therapy", "event": "joined", "join_bootstrap": token},
            headers=self._auth_header(),
        )
        self.assertEqual(authenticated.status_code, 200)

    @patch("local_server.notify_meeting_event")
    @patch("local_server.authorize_meeting_join")
    @patch("local_server.initialize_constants")
    def test_meeting_participant_event_supports_guest_bootstrap(
        self,
        mocked_initialize_constants,
        mocked_authorize,
        mocked_notify_event,
    ):
        mocked_initialize_constants.return_value = self.constants
        mocked_authorize.return_value = {
            "ok": True,
            "data": {
                "meeting_id": "meeting-123",
                "participant_role": "guest",
                "client_id": "client-123",
                "consultant_id": "consultant-456",
            },
        }
        mocked_notify_event.return_value = {"ok": True}
        token = _signed_bootstrap(
            "test-secret",
            {
                "meeting_id": "meeting-123",
                "response_access_link_id": "link-123",
                "participant_role": "guest",
                "exp": int(time.time()) + 60,
            },
        )

        response = self.client.post(
            "/meeting-participant-event",
            json={"profile": "therapy", "event": "joined", "join_bootstrap": token},
        )
        self.assertEqual(response.status_code, 200)
        mocked_authorize.assert_called_once()
        auth_payload = mocked_authorize.call_args.args[1]
        self.assertEqual(auth_payload["participant_role"], "guest")
        self.assertEqual(auth_payload["response_access_link_id"], "link-123")

    @patch("local_server.initialize_constants")
    def test_end_meeting_requires_valid_host_bootstrap(self, mocked_initialize_constants):
        mocked_initialize_constants.return_value = self.constants
        response = self.client.post("/end-meeting", json={"join_bootstrap": "bad"})
        self.assertEqual(response.status_code, 403)

    @patch("local_server._post_custom_llm_sync")
    @patch("local_server.notify_meeting_end")
    @patch("local_server.initialize_constants")
    def test_end_meeting_requires_verified_channel_in_bootstrap(
        self,
        mocked_initialize_constants,
        mocked_notify_meeting_end,
        mocked_post_custom_llm,
    ):
        mocked_initialize_constants.return_value = self.constants
        token = _signed_bootstrap(
            "test-secret",
            {
                "meeting_id": "meeting-123",
                "consultant_id": "consultant-456",
                "participant_role": "host",
                "exp": int(time.time()) + 60,
            },
        )
        response = self.client.post("/end-meeting", json={"join_bootstrap": token, "channel": "attacker-channel"})
        self.assertEqual(response.status_code, 400)
        mocked_notify_meeting_end.assert_not_called()
        mocked_post_custom_llm.assert_not_called()

    @patch("local_server._post_custom_llm_sync")
    @patch("local_server.notify_meeting_end")
    @patch("local_server.initialize_constants")
    def test_end_meeting_notifies_dashboard_before_unregister(
        self,
        mocked_initialize_constants,
        mocked_notify_meeting_end,
        mocked_post_custom_llm,
    ):
        mocked_initialize_constants.return_value = self.constants
        mocked_notify_meeting_end.return_value = {"ok": True}
        mocked_post_custom_llm.return_value = {"ok": True, "status": 200, "body": "{}"}
        token = _signed_bootstrap(
            "test-secret",
            {
                "meeting_id": "meeting-123",
                "consultant_id": "consultant-456",
                "participant_role": "host",
                "channel_name": "MEET123456",
                "exp": int(time.time()) + 60,
            },
        )
        response = self.client.post("/end-meeting", json={"join_bootstrap": token})
        self.assertEqual(response.status_code, 200)
        mocked_notify_meeting_end.assert_called_once()
        mocked_post_custom_llm.assert_called_once()

    @patch("local_server._post_custom_llm_sync")
    @patch("local_server.notify_meeting_end")
    @patch("local_server.initialize_constants")
    def test_end_meeting_forwards_transcript_artifact(
        self,
        mocked_initialize_constants,
        mocked_notify_meeting_end,
        mocked_post_custom_llm,
    ):
        mocked_initialize_constants.return_value = self.constants
        mocked_notify_meeting_end.return_value = {"ok": True}
        mocked_post_custom_llm.return_value = {"ok": True, "status": 200, "body": "{}"}
        token = _signed_bootstrap(
            "test-secret",
            {
                "meeting_id": "meeting-123",
                "consultant_id": "consultant-456",
                "participant_role": "host",
                "channel_name": "MEET123456",
                "exp": int(time.time()) + 60,
            },
        )
        transcript = {
            "text": "Client discussed work stress.",
            "lines": [{"uid": "101", "time": "2026-04-18T12:00:00Z", "text": "Client discussed work stress.", "source_lang": ""}],
        }
        response = self.client.post(
            "/end-meeting",
            json={"join_bootstrap": token, "transcript": transcript},
        )
        self.assertEqual(response.status_code, 200)
        unregister_payload = mocked_post_custom_llm.call_args.args[1]
        self.assertEqual(unregister_payload["transcript"]["text"], "Client discussed work stress.")
