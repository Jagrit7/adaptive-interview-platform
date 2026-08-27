"""Tests for optional consultant-dashboard integration."""

import hashlib
import unittest
import urllib.error
from unittest.mock import patch

import core.consultant_dashboard as consultant_dashboard

from core.consultant_dashboard import (
    _build_identity_query,
    build_prompt_addition,
    dashboard_client_required,
    fetch_dashboard_meeting_signals,
    resolve_dashboard_client,
    verify_dashboard_client_password,
)


class ConsultantDashboardTest(unittest.TestCase):
    def test_build_identity_query_from_profile_data(self):
        profile = {
            "google_sub": "google-sub-123",
            "email": "alex@example.com",
            "name_hash": "namehash",
            "phone_hash": "phonehash",
        }

        query = _build_identity_query(profile)

        self.assertEqual(query["normalized_name_hash"], "namehash")
        self.assertEqual(query["phone_hash"], "phonehash")
        self.assertIn("google_sub_hash", query)
        self.assertIn("email_hash", query)

    def test_build_prompt_addition_includes_dashboard_context(self):
        prompt = build_prompt_addition({
            "notes": "Generalized background notes.",
            "direction": "Focus on routines.",
            "latest_summary": {
                "brief_overview": "Client discussed stress at work.",
                "full_summary": "Client discussed stress at work and difficulty switching off at night.",
                "biomarker_summary": "Stress remained elevated.",
            },
            "recent_summaries": [
                {
                    "ended_at": "2026-04-13T18:05:00Z",
                    "full_summary": "Older recent summary for continuity.",
                }
            ],
            "baseline": {
                "averages": {
                    "hrv": 31.0,
                    "stress_index": 52.5,
                }
            },
            "alerts": [
                {"severity": "warning", "title": "Elevated stress"},
            ],
        })

        self.assertIn("Background notes", prompt)
        self.assertIn("Focus on routines.", prompt)
        self.assertIn("Client discussed stress at work.", prompt)
        self.assertIn("difficulty switching off at night", prompt)
        self.assertIn("Older recent summary for continuity.", prompt)
        self.assertIn("stress_index=52.5", prompt)
        self.assertIn("warning: Elevated stress", prompt)

    def test_build_prompt_addition_truncates_recent_full_summaries(self):
        long_summary = "A" * 400
        prompt = build_prompt_addition({
            "recent_summaries": [
                {"ended_at": "2026-04-13T18:05:00Z", "full_summary": long_summary},
                {"ended_at": "2026-04-12T18:05:00Z", "full_summary": "Second summary"},
                {"ended_at": "2026-04-11T18:05:00Z", "full_summary": "Third summary"},
                {"ended_at": "2026-04-10T18:05:00Z", "full_summary": "Fourth summary"},
            ],
        })

        self.assertIn("Recent full session summaries:", prompt)
        self.assertIn("A" * 50, prompt)
        self.assertNotIn(long_summary, prompt)
        self.assertIn("…", prompt)
        self.assertNotIn("Fourth summary", prompt)

    def test_dashboard_client_required_only_when_flag_and_config_present(self):
        self.assertTrue(dashboard_client_required({
            "CONSULTANT_DASHBOARD_URL": "http://127.0.0.1:8090",
            "CONSULTANT_DASHBOARD_INTERNAL_SHARED_SECRET": "secret",
            "REQUIRE_CONSULTANT_DASHBOARD_CLIENT": "true",
        }))
        self.assertFalse(dashboard_client_required({
            "CONSULTANT_DASHBOARD_URL": "http://127.0.0.1:8090",
            "CONSULTANT_DASHBOARD_INTERNAL_SHARED_SECRET": "secret",
            "REQUIRE_CONSULTANT_DASHBOARD_CLIENT": "false",
        }))
        self.assertFalse(dashboard_client_required({
            "REQUIRE_CONSULTANT_DASHBOARD_CLIENT": "true",
        }))

    def test_resolve_dashboard_client_uses_email_and_phone_hash(self):
        calls = []

        def fake_signed_get_json(_base_url, path, query_params, _shared_secret, _timeout_seconds):
            calls.append((path, query_params))
            self.assertEqual(path, "/internal/resolve-client")
            self.assertEqual(
                query_params["email_hash"],
                hashlib.sha256(b"alex@example.com").hexdigest(),
            )
            self.assertEqual(query_params["phone_hash"], "phonehash")
            return 200, {
                "found": True,
                "client_id": "client-123",
                "consultant_id": "consultant-456",
                "first_name": "Alex",
                "display_name": "Alex Demo",
            }

        with patch.object(consultant_dashboard, "_signed_get_json", fake_signed_get_json):
            result = resolve_dashboard_client(
                {
                    "CONSULTANT_DASHBOARD_URL": "http://127.0.0.1:8090",
                    "CONSULTANT_DASHBOARD_INTERNAL_SHARED_SECRET": "secret",
                    "CONSULTANT_DASHBOARD_TIMEOUT_SECONDS": "5",
                },
                profile_data={"email": "Alex@Example.com", "phone_hash": "phonehash"},
            )

        self.assertEqual(result["status"], "resolved")
        self.assertEqual(result["client_id"], "client-123")
        self.assertEqual(result["consultant_id"], "consultant-456")
        self.assertEqual(result["first_name"], "Alex")
        self.assertEqual(len(calls), 1)

    def test_verify_dashboard_client_password_returns_verified_client(self):
        calls = []

        def fake_signed_post_json(_base_url, path, payload, _shared_secret, _timeout_seconds):
            calls.append((path, payload))
            self.assertEqual(path, "/internal/verify-client-password")
            self.assertEqual(payload["email"], "alex@example.com")
            self.assertEqual(payload["password"], "clientpass123")
            return 200, {
                "ok": True,
                "client_id": "client-123",
                "consultant_id": "consultant-456",
                "first_name": "Alex",
                "display_name": "Alex Demo",
                "email": "alex@example.com",
                "phone_number": "+447700900111",
            }

        with patch.object(consultant_dashboard, "_signed_post_json", fake_signed_post_json):
            result = verify_dashboard_client_password(
                {
                    "CONSULTANT_DASHBOARD_URL": "http://127.0.0.1:8090",
                    "CONSULTANT_DASHBOARD_INTERNAL_SHARED_SECRET": "secret",
                    "CONSULTANT_DASHBOARD_TIMEOUT_SECONDS": "5",
                },
                "Alex@Example.com",
                "clientpass123",
            )

        self.assertEqual(result["status"], "verified")
        self.assertEqual(result["client_id"], "client-123")
        self.assertEqual(result["first_name"], "Alex")
        self.assertEqual(len(calls), 1)

    def test_fetch_dashboard_meeting_signals_returns_flags(self):
        calls = []

        def fake_signed_get_json(_base_url, path, query_params, _shared_secret, _timeout_seconds):
            calls.append((path, query_params))
            self.assertEqual(path, "/internal/meeting-signals")
            self.assertEqual(query_params["meeting_id"], "meeting-123")
            return 200, {
                "ok": True,
                "meeting_id": "meeting-123",
                "meeting_type": "ai",
                "transcription_enabled": True,
                "audio_biomarkers_enabled": True,
                "video_biomarkers_enabled": False,
            }

        with patch.object(consultant_dashboard, "_signed_get_json", fake_signed_get_json):
            result = fetch_dashboard_meeting_signals(
                {
                    "CONSULTANT_DASHBOARD_URL": "http://127.0.0.1:8090",
                    "CONSULTANT_DASHBOARD_INTERNAL_SHARED_SECRET": "secret",
                    "CONSULTANT_DASHBOARD_TIMEOUT_SECONDS": "5",
                },
                "meeting-123",
            )

        self.assertEqual(result["status"], "resolved")
        self.assertEqual(result["meeting_type"], "ai")
        self.assertFalse(result["video_biomarkers_enabled"])
        self.assertEqual(len(calls), 1)

    def test_resolve_dashboard_client_returns_dashboard_unavailable_for_network_errors(self):
        with patch.object(
            consultant_dashboard,
            "_signed_get_json",
            side_effect=urllib.error.URLError("connection refused"),
        ):
            result = resolve_dashboard_client(
                {
                    "CONSULTANT_DASHBOARD_URL": "http://127.0.0.1:8090",
                    "CONSULTANT_DASHBOARD_INTERNAL_SHARED_SECRET": "secret",
                    "CONSULTANT_DASHBOARD_TIMEOUT_SECONDS": "5",
                },
                profile_data={"email": "Alex@Example.com", "phone_hash": "phonehash"},
            )

        self.assertEqual(result["status"], "lookup_failed")
        self.assertEqual(
            result["error"],
            "Dashboard authorization is temporarily unavailable. Please try again.",
        )


if __name__ == "__main__":
    unittest.main()
