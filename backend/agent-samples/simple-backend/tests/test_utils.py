"""Tests for core.utils module"""

import pytest
from core.utils import generate_random_channel


@pytest.mark.unit
class TestGenerateRandomChannel:
    """Tests for generate_random_channel function"""

    def test_default_length(self):
        """Test channel generation with default length"""
        channel = generate_random_channel()
        assert len(channel) == 10
        assert channel.isalnum()

    def test_custom_length(self):
        """Test channel generation with custom length"""
        channel = generate_random_channel(10)
        assert len(channel) == 10
        assert channel.isalnum()

    def test_uniqueness(self):
        """Test that generated channels are unique"""
        channels = [generate_random_channel() for _ in range(100)]
        assert len(channels) == len(set(channels))

    def test_valid_characters(self):
        """Test that channel only contains alphanumeric characters"""
        channel = generate_random_channel(50)
        assert all(c.isalnum() for c in channel)
