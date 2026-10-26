"""Check local readiness, optionally probe official model catalogs without inference."""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx

from app.integration_config import load_integration_settings, optimizer_registry


def catalog_probe(provider, config, client=None):
    """Never return response bodies, headers, URLs containing keys, or raw exceptions."""
    endpoints = {
        "groq": ("https://api.groq.com/openai/v1/models", config.groq_api_key),
        "gemini": ("https://generativelanguage.googleapis.com/v1beta/models", config.gemini_api_key),
        "openrouter": ("https://openrouter.ai/api/v1/models", config.openrouter_api_key),
    }
    if provider not in endpoints:
        return {"status": "BLOCKED", "reason": "Provider is outside the free-only policy"}
    url, secret = endpoints[provider]
    headers = {"x-goog-api-key": secret} if provider == "gemini" else {"Authorization": "Bearer " + secret}
    request = client or httpx
    try:
        response = request.get(url, headers=headers, timeout=config.timeout, follow_redirects=False)
        if response.status_code != 200:
            return {"status": "ERROR", "reason": f"Catalog returned HTTP {response.status_code}"}
        payload = response.json()
        rows = payload.get("models" if provider == "gemini" else "data", [])
        if not isinstance(rows, list):
            return {"status": "ERROR", "reason": "Unexpected catalog format"}
        identifiers = {r.get("name", "").removeprefix("models/") if provider == "gemini" else r.get("id", "")
                       for r in rows if isinstance(r, dict)}
        return {"status": "CATALOG_OK", "models": identifiers,
                "reason": "Catalog reachable; inference and free-account billing not verified"}
    except Exception:  # noqa: BLE001 - raw provider/config errors may contain credentials
        return {"status": "ERROR", "reason": "Catalog request failed; details withheld to protect credentials"}


def main(argv=None):
    parser = argparse.ArgumentParser(description="Check Tokenz free-provider configuration without printing keys")
    parser.add_argument("--live", action="store_true", help="GET official model catalogs only; no completion calls")
    args = parser.parse_args(argv)
    print("Tokenz provider check")
    print("[BLOCKED] OpenAI target: paid API calls disabled. Free OpenRouter targets are separate models, not ChatGPT.")
    print("LOCAL CONFIG ONLY: authentication and model availability are not checked." if not args.live else
          "LIVE CATALOG CHECK: no inference calls; this does not verify billing status or completion availability.")
    try:
        config = load_integration_settings()
        registry = optimizer_registry(config)
    except Exception:  # noqa: BLE001 - raw provider/config errors may contain credentials
        print("[ERROR] Invalid local configuration; check numeric, boolean and model settings. No secrets shown.")
        return 2
    probes = {}
    failed = False
    for key, row in registry.items():
        if not row["available"]:
            print(f"[SKIP] {key}: {row['reason']}")
            continue
        if not args.live:
            print(f"[CONFIGURED] {key}: ready for a catalog check; not authenticated or live tested")
            continue
        provider = row["provider"]
        if provider not in probes:
            probes[provider] = catalog_probe(provider, config)
        probe = probes[provider]
        if probe["status"] != "CATALOG_OK":
            failed = True
            print(f"[{probe['status']}] {key}: {probe['reason']}")
        elif row["model"] not in probe["models"]:
            failed = True
            print(f"[UNAVAILABLE] {key}: configured model absent from current catalog; no substitution")
        else:
            print(f"[CATALOG_OK] {key}: listed; inference, authentication scope and billing not verified")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
