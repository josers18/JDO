# tests/test_segments_data_cloud_delete.py
from unittest.mock import patch, MagicMock
from urllib.error import HTTPError
from io import BytesIO


def test_delete_segment_returns_true_on_204():
    with patch("urllib.request.urlopen") as urlopen:
        cm = MagicMock()
        cm.__enter__.return_value.read.return_value = b""
        cm.__enter__.return_value.status = 204
        urlopen.return_value = cm

        from customer_hydration.phase5.data_cloud import delete_segment
        ok, msg = delete_segment("https://x", "tok", api_name="WealthAll__seg")
        assert ok is True
        assert "WealthAll__seg" in msg or "deleted" in msg.lower()


def test_delete_segment_returns_true_on_404():
    err = HTTPError(
        url="https://x/services/data/v60.0/ssot/segments/WealthAll__seg",
        code=404, msg="Not Found", hdrs=None, fp=BytesIO(b'{"error":"not found"}'),
    )
    with patch("urllib.request.urlopen", side_effect=err):
        from customer_hydration.phase5.data_cloud import delete_segment
        ok, msg = delete_segment("https://x", "tok", api_name="WealthAll__seg")
        assert ok is True
        assert "404" in msg


def test_delete_segment_returns_false_on_403():
    err = HTTPError(
        url="https://x/services/data/v60.0/ssot/segments/WealthAll__seg",
        code=403, msg="Forbidden", hdrs=None, fp=BytesIO(b'{"error":"perm"}'),
    )
    with patch("urllib.request.urlopen", side_effect=err):
        from customer_hydration.phase5.data_cloud import delete_segment
        ok, msg = delete_segment("https://x", "tok", api_name="WealthAll__seg")
        assert ok is False
        assert "403" in msg
