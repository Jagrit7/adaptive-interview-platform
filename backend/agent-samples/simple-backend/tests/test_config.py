"""Tests for core.config module"""

import pytest
import os
from core.config import initialize_constants


@pytest.mark.unit
class TestInitializeConstants:
    """Tests for initialize_constants function"""

    def test_loads_environment_variables(self, monkeypatch):
        """Test that function loads from environment"""
        # Set test environment variables
        monkeypatch.setenv("APP_ID", "test_app_id")
        monkeypatch.setenv("USER_UID", "999")

        constants = initialize_constants()

        assert "APP_ID" in constants
        assert constants["APP_ID"] == "test_app_id"

    def test_handles_missing_optional_vars(self):
        """Test that function handles missing optional variables"""
        # This should not raise an error even with missing vars
        constants = initialize_constants()

        # Should have some structure even if empty
        assert isinstance(constants, dict)

    def test_type_conversions(self, monkeypatch):
        """Test that environment variables are loaded as strings"""
        monkeypatch.setenv("USER_UID", "123")
        monkeypatch.setenv("TTS_SAMPLE_RATE", "16000")
        monkeypatch.setenv("TTS_SPEED", "1.5")

        constants = initialize_constants()

        # Values are returned as strings from environment
        assert isinstance(constants.get("USER_UID", ""), str)
        assert isinstance(constants.get("TTS_SAMPLE_RATE", ""), str)
        assert isinstance(constants.get("TTS_SPEED", ""), str)
