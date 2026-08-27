"""Tests for X profile prompt helpers."""

from x.profile_prompt import build_profile_overrides_from_handle


def test_build_profile_overrides_from_handle(monkeypatch):
    monkeypatch.setattr(
        "x.profile_prompt.lookup_user",
        lambda token, username, timeout_seconds: {
            "data": {
                "id": "123",
                "name": "Paul Graham",
                "username": "paulg",
                "description": "Essays, startups, and technology.",
                "profile_image_url": "https://pbs.twimg.com/profile_images/123/paulg_normal.jpg",
                "verified": True,
                "public_metrics": {"followers_count": 1000000},
            }
        },
    )
    monkeypatch.setattr(
        "x.profile_prompt.fetch_user_timeline",
        lambda token, user_id, timeout_seconds, max_results: {
            "data": [
                {
                    "id": "1",
                    "text": "Startups are like scientific experiments; most fail, but a few change everything.",
                    "created_at": "2026-05-01T00:00:00.000Z",
                },
                {
                    "id": "2",
                    "text": "One underrated founder skill is noticing what other people ignore.",
                    "created_at": "2026-05-02T00:00:00.000Z",
                },
            ]
        },
    )

    payload = build_profile_overrides_from_handle("paulg", bearer_token="test-token")

    assert payload["avatar_id"] == "https://pbs.twimg.com/profile_images/123/paulg.jpg"
    assert payload["avatar_url_normal"] == "https://pbs.twimg.com/profile_images/123/paulg_normal.jpg"
    assert payload["greeting"].startswith("Hi, I'm Paul Graham")
    assert len(payload["greeting"]) < 200
    assert "You are roleplaying as Paul Graham (@paulg) in a live voice and video conversation." in payload["prompt"]
    assert "Bio: Essays, startups, and technology." in payload["prompt"]
    assert "Keep responses under 20 words unless something more substantial is required." in payload["prompt"]
