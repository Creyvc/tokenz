"""Small, secret-safe account health check; never makes completion requests."""
import httpx


def check_connection(key, transport=None):
    if not key or not key.strip():
        return {"ok": False, "code": "MISSING_KEY", "message": "Add your OpenRouter API key to connect."}
    try:
        with httpx.Client(timeout=20, transport=transport) as client:
            response = client.get("https://openrouter.ai/api/v1/key",
                                  headers={"Authorization": "Bearer " + key.strip()})
        if response.status_code == 401:
            return {"ok": False, "code": "AUTHENTICATION", "message": "OpenRouter rejected this key. Paste the full secret API key, not its name or ID, and press Connect."}
        if response.status_code != 200:
            return {"ok": False, "code": "UNAVAILABLE", "message": "OpenRouter is unavailable or access is restricted. Try connecting again later."}
        data = response.json()["data"]
        quota = data.get("free_model_daily_requests") or {}
        remaining = quota.get("remaining")
        if type(remaining) is int and remaining <= 0:
            return {"ok": False, "authenticated": True, "code": "DAILY_LIMIT", "message": "Today's free allowance is used up. Saved reports still work; new comparisons can resume after OpenRouter resets it.", "remaining": 0}
        return {"ok": True, "authenticated": True, "code": "CONNECTED", "message": "Connected to OpenRouter.",
                "remaining": remaining if type(remaining) is int else None}
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        return {"ok": False, "code": "NETWORK", "message": "Cannot reach OpenRouter. Check your internet connection and try again."}
