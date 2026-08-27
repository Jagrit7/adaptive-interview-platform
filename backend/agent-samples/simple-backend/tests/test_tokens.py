"""Tests for core.tokens module"""

import pytest
from core.tokens import build_token_with_rtm, get_version


@pytest.mark.unit
class TestTokenGeneration:
    """Tests for token generation functions"""

    def test_get_version(self):
        """Test that version is correct"""
        assert get_version() == '007'

    def test_build_token_with_rtm_structure(self, test_constants):
        """Test that token is generated with correct structure"""
        channel = "test_channel"
        uid = "123"

        result = build_token_with_rtm(channel, uid, test_constants)

        # Check return structure
        assert "token" in result
        assert "uid" in result
        assert result["uid"] == uid
        assert isinstance(result["token"], str)
        assert len(result["token"]) > 0

    def test_build_token_without_certificate(self, test_constants):
        """Test token generation without APP_CERTIFICATE"""
        constants = test_constants.copy()
        constants["APP_CERTIFICATE"] = ""
        channel = "test_channel"
        uid = "123"

        result = build_token_with_rtm(channel, uid, constants)

        # Should return APP_ID as token when no certificate
        assert result["token"] == constants["APP_ID"]
        assert result["uid"] == uid

    def test_different_channels_different_tokens(self, test_constants):
        """Test that different channels produce different tokens"""
        uid = "123"

        token1 = build_token_with_rtm("channel1", uid, test_constants)
        token2 = build_token_with_rtm("channel2", uid, test_constants)

        assert token1["token"] != token2["token"]

    def test_different_uids_different_tokens(self, test_constants):
        """Test that different UIDs produce different tokens"""
        channel = "test_channel"

        token1 = build_token_with_rtm(channel, "123", test_constants)
        token2 = build_token_with_rtm(channel, "456", test_constants)

        assert token1["token"] != token2["token"]
