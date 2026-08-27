import os
import shutil
import tempfile
import time
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import jwt

from local_server import app


class PasswordLoginAuthTest(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.client = app.test_client()
        self.constants = {
            "AUTH_JWT_SECRET": "test-jwt-secret",
            "ENCRYPTION_KEY": "a" * 64,
            "AUTH_DATA_DIR": self.tmpdir,
            "ALLOWED_RETURN_ORIGINS": "http://localhost:8084",
            "CONSULTANT_DASHBOARD_URL": "http://127.0.0.1:8090",
            "CONSULTANT_DASHBOARD_INTERNAL_SHARED_SECRET": "secret",
            "CONSULTANT_DASHBOARD_TIMEOUT_SECONDS": "5",
            "REQUIRE_CONSULTANT_DASHBOARD_CLIENT": "true",
            "AUTH_BRAND_NAME": "MindFix",
            "TWILIO_ACCOUNT_SID": "",
            "TWILIO_AUTH_TOKEN": "",
            "TWILIO_VERIFY_SERVICE_SID": "",
        }

    def tearDown(self):
        shutil.rmtree(self.tmpdir)

    def test_password_login_flow_mints_jwt(self):
        with patch("core.auth._get_profile_constants", return_value=self.constants), \
             patch("core.auth.AUTH_DEV_MODE", True), \
             patch(
                 "core.consultant_dashboard.verify_dashboard_client_password",
                 return_value={
                     "status": "verified",
                     "client_id": "client-123",
                     "consultant_id": "consultant-456",
                     "first_name": "Alex",
                     "display_name": "Alex Demo",
                     "email": "alex@example.com",
                     "phone_number": "+447700900111",
                 },
             ), \
             patch(
                 "core.consultant_dashboard.resolve_dashboard_client",
                 return_value={
                     "status": "resolved",
                     "client_id": "client-123",
                     "consultant_id": "consultant-456",
                     "first_name": "Alex",
                     "display_name": "Alex Demo",
                     "email": "alex@example.com",
                     "phone_number": "+447700900111",
                 },
             ):
            login_page = self.client.get(
                "/auth/login?profile=therapy&return=http://localhost:8084/?profile=therapy&autoconnect=true"
            )
            self.assertEqual(login_page.status_code, 200)

            send_code = self.client.post(
                "/auth/password-login",
                data={"email": "alex@example.com", "password": "clientpass123"},
            )
            self.assertEqual(send_code.status_code, 200)
            self.assertTrue(send_code.json["success"])
            self.assertEqual(send_code.json["redirect"], "/auth/verify")

            verify = self.client.post("/auth/verify-pin", data={"pin": "000000"})
            self.assertEqual(verify.status_code, 200)
            self.assertTrue(verify.json["success"])

            redirect_url = verify.json["redirect"]
            parsed = urlparse(redirect_url)
            self.assertEqual(parsed.path, "/")
            self.assertNotIn("auth_token=", redirect_url)
            cookie_header = verify.headers.get("Set-Cookie", "")
            self.assertIn("mindfix_client_auth=", cookie_header)
            token = cookie_header.split("mindfix_client_auth=", 1)[1].split(";", 1)[0]
            claims = jwt.decode(token, self.constants["AUTH_JWT_SECRET"], algorithms=["HS256"])
            self.assertEqual(claims["client_id"], "client-123")
            self.assertEqual(claims["email"], "alex@example.com")
            self.assertEqual(claims["name"], "Alex Demo")
            self.assertEqual(claims["first_name"], "Alex")

    def test_tenant_prefixed_password_login_flow_preserves_prefix(self):
        with patch("core.auth._get_profile_constants", return_value=self.constants), \
             patch("core.auth.AUTH_DEV_MODE", True), \
             patch(
                 "core.consultant_dashboard.verify_dashboard_client_password",
                 return_value={
                     "status": "verified",
                     "client_id": "client-123",
                     "consultant_id": "consultant-456",
                     "first_name": "Alex",
                     "display_name": "Alex Demo",
                     "email": "alex@example.com",
                     "phone_number": "+447700900111",
                 },
             ):
            login_page = self.client.get("/v/mindfix/auth/login?profile=therapy")
            self.assertEqual(login_page.status_code, 200)
            self.assertIn(b'/v/mindfix/auth/google', login_page.data)

            send_code = self.client.post(
                "/v/mindfix/auth/password-login",
                data={"email": "alex@example.com", "password": "clientpass123"},
            )
            self.assertEqual(send_code.status_code, 200)
            self.assertEqual(send_code.json["redirect"], "/v/mindfix/auth/verify")

    def test_login_page_renders_shared_topbar_and_continue_label(self):
        with patch("core.auth._get_profile_constants", return_value=self.constants):
            response = self.client.get("/v/mindfix/auth/login?profile=therapy")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"topbar", response.data)
        self.assertIn(b">Continue<", response.data)

    def test_verify_page_matches_shared_check_messages_copy(self):
        with patch("core.auth._get_profile_constants", return_value=self.constants):
            with self.client.session_transaction() as session:
                session["auth_user_id_hash"] = "user-hash-123"
                session["auth_profile"] = "therapy"
                session["auth_vendor_slug"] = "mindfix"
            response = self.client.get("/v/mindfix/auth/verify")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Check your messages", response.data)
        self.assertIn(b"We sent a 6-digit code to your phone.", response.data)

    def test_google_callback_for_dashboard_client_goes_straight_to_verify(self):
        token_payload = {
            "sub": "google-sub-123",
            "email": "alex@example.com",
            "name": "Alex Demo",
        }
        token_segment = jwt.utils.base64url_encode(b'{"alg":"none"}').decode()
        payload_segment = jwt.utils.base64url_encode(
            __import__("json").dumps(token_payload).encode()
        ).decode()
        fake_id_token = f"{token_segment}.{payload_segment}.sig"

        class FakeGoogleTokenResponse:
            status = 200

            def read(self):
                return __import__("json").dumps({"id_token": fake_id_token}).encode()

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

        with patch("core.auth._get_profile_constants", return_value=self.constants), \
             patch("core.auth.AUTH_DEV_MODE", True), \
             patch(
                 "core.consultant_dashboard.resolve_dashboard_client",
                 return_value={
                     "status": "resolved",
                     "client_id": "client-123",
                     "consultant_id": "consultant-456",
                     "first_name": "Alex",
                     "display_name": "Alex Demo",
                     "email": "alex@example.com",
                     "phone_number": "+447700900111",
                 },
             ), \
             patch("urllib.request.urlopen", return_value=FakeGoogleTokenResponse()):
            login_page = self.client.get(
                "/auth/login?profile=therapy&return=http://localhost:8084/?profile=therapy"
            )
            self.assertEqual(login_page.status_code, 200)

            callback = self.client.get("/auth/google/callback?code=test-code", follow_redirects=False)
            self.assertEqual(callback.status_code, 302)
            self.assertEqual(callback.location, "/auth/verify")

            verify_page = self.client.get("/auth/verify")
            self.assertEqual(verify_page.status_code, 200)
            self.assertIn(b"We sent a 6-digit code to your phone", verify_page.data)

            verify = self.client.post("/auth/verify-pin", data={"pin": "000000"})
            self.assertEqual(verify.status_code, 200)
            self.assertTrue(verify.json["success"])

            redirect_url = verify.json["redirect"]
            parsed = urlparse(redirect_url)
            self.assertEqual(parsed.path, "/")
            self.assertNotIn("auth_token=", redirect_url)
            cookie_header = verify.headers.get("Set-Cookie", "")
            self.assertIn("mindfix_client_auth=", cookie_header)
            token = cookie_header.split("mindfix_client_auth=", 1)[1].split(";", 1)[0]
            claims = jwt.decode(token, self.constants["AUTH_JWT_SECRET"], algorithms=["HS256"])
            self.assertEqual(claims["client_id"], "client-123")
            self.assertEqual(claims["email"], "alex@example.com")
            self.assertEqual(claims["name"], "Alex Demo")
            self.assertEqual(claims["first_name"], "Alex")

    def test_shared_google_callback_redirects_back_into_tenant_verify_page(self):
        token_payload = {
            "sub": "google-sub-123",
            "email": "alex@example.com",
            "name": "Alex Demo",
        }
        token_segment = jwt.utils.base64url_encode(b'{"alg":"none"}').decode()
        payload_segment = jwt.utils.base64url_encode(
            __import__("json").dumps(token_payload).encode()
        ).decode()
        fake_id_token = f"{token_segment}.{payload_segment}.sig"

        class FakeGoogleTokenResponse:
            status = 200

            def read(self):
                return __import__("json").dumps({"id_token": fake_id_token}).encode()

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

        with patch("core.auth._get_profile_constants", return_value=self.constants), \
             patch("core.auth.AUTH_DEV_MODE", True), \
             patch(
                 "core.consultant_dashboard.resolve_dashboard_client",
                 return_value={
                     "status": "resolved",
                     "client_id": "client-123",
                     "consultant_id": "consultant-456",
                     "first_name": "Alex",
                     "display_name": "Alex Demo",
                     "email": "alex@example.com",
                     "phone_number": "+447700900111",
                 },
             ), \
             patch("urllib.request.urlopen", return_value=FakeGoogleTokenResponse()):
            login_page = self.client.get("/v/mindfix/auth/login?profile=therapy")
            self.assertEqual(login_page.status_code, 200)

            callback = self.client.get("/auth/google/callback?code=test-code", follow_redirects=False)
            self.assertEqual(callback.status_code, 302)
            self.assertEqual(callback.location, "/v/mindfix/auth/verify")

    def test_shared_google_callback_can_handoff_consultant_flow(self):
        token_payload = {
            "sub": "google-sub-123",
            "email": "consultant@example.com",
            "name": "Test Consultant",
        }
        token_segment = jwt.utils.base64url_encode(b'{"alg":"none"}').decode()
        payload_segment = jwt.utils.base64url_encode(
            __import__("json").dumps(token_payload).encode()
        ).decode()
        fake_id_token = f"{token_segment}.{payload_segment}.sig"

        class FakeGoogleTokenResponse:
            status = 200

            def read(self):
                return __import__("json").dumps({"id_token": fake_id_token}).encode()

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

        consultant_state = "eyJleHAiOjQ3NjI4MDAwMDAsInByb2ZpbGUiOiJ0aGVyYXB5IiwicHVycG9zZSI6ImNvbnN1bHRhbnRfZ29vZ2xlX3N0YXRlIiwiY29tcGxldGVfdXJsIjoiaHR0cHM6Ly92ZW5kb3IuZXhhbXBsZS9jb25zdWx0YW50L2dvb2dsZS9jYWxsYmFjayIsInZlbmRvcl9zbHVnIjoibWluZGZpeCJ9.235ae3bf26355178e6e081f27517d3ba55e90597b7f1af225d21ae7f6482717e"
        # Re-sign the state with the test dashboard secret so the callback can verify it.
        import base64, hashlib, hmac, json as _json
        payload = {
            "purpose": "consultant_google_state",
            "vendor_slug": "mindfix",
            "complete_url": "https://vendor.example/consultant/google/callback",
            "profile": "therapy",
            "exp": int(time.time()) + 300,
        }
        encoded = base64.urlsafe_b64encode(
            _json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
        ).decode().rstrip("=")
        consultant_state = f"{encoded}.{hmac.new(self.constants['CONSULTANT_DASHBOARD_INTERNAL_SHARED_SECRET'].encode(), encoded.encode(), hashlib.sha256).hexdigest()}"

        with patch("core.config.initialize_constants", return_value=self.constants), \
             patch("urllib.request.urlopen", return_value=FakeGoogleTokenResponse()):
            callback = self.client.get(
                f"/auth/google/callback?code=test-code&state={consultant_state}",
                follow_redirects=False,
            )

        self.assertEqual(callback.status_code, 302)
        parsed = urlparse(callback.location)
        self.assertEqual(parsed.scheme, "https")
        self.assertEqual(parsed.netloc, "vendor.example")
        self.assertEqual(parsed.path, "/consultant/google/callback")
        params = parse_qs(parsed.query)
        self.assertIn("consultant_token", params)

    def test_auth_check_accepts_cookie_auth_without_bearer_token(self):
        token = jwt.encode(
            {
                "user_id": "user-hash-123",
                "client_id": "client-123",
                "email": "alex@example.com",
                "name": "Alex Demo",
                "iat": int(time.time()),
                "exp": int(time.time()) + 300,
            },
            self.constants["AUTH_JWT_SECRET"],
            algorithm="HS256",
        )

        with patch("core.config.initialize_constants", return_value=self.constants), \
             patch(
                 "core.consultant_dashboard.resolve_dashboard_client",
                 return_value={"status": "resolved", "client_id": "client-123"},
             ):
            self.client.set_cookie("mindfix_client_auth", token)
            response = self.client.get("/auth-check?profile=therapy")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json["authenticated"])
        self.assertEqual(response.json["user_name"], "Alex Demo")

    def test_auth_login_reuses_existing_cookie_session_without_resending_otp(self):
        token = jwt.encode(
            {
                "user_id": "user-hash-123",
                "client_id": "client-123",
                "email": "alex@example.com",
                "name": "Alex Demo",
                "iat": int(time.time()),
                "exp": int(time.time()) + 300,
            },
            self.constants["AUTH_JWT_SECRET"],
            algorithm="HS256",
        )

        with patch("core.auth._get_profile_constants", return_value=self.constants):
            self.client.set_cookie("mindfix_client_auth", token)
            response = self.client.get(
                "/auth/login?profile=therapy&return=http://localhost:8084/?profile=therapy",
                follow_redirects=False,
            )

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.location, "http://localhost:8084/?profile=therapy")


if __name__ == "__main__":
    unittest.main()
