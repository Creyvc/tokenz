"""Make the About page's spoken hellos with ElevenLabs, once, as small .mp3 files.

The site never talks to ElevenLabs and never holds the key: this script makes the files and the
page plays them (frontend/hello.js), falling back to the browser's own voices if a file is missing.

    python3 tools/make-hellos.py            # makes any that are missing
    python3 tools/make-hellos.py --again    # makes all three again (e.g. after changing a voice)

The key is read from ELEVENLABS_API_KEY: in the environment, or in backend/.env or
backend/optimizer/.env (both git-ignored).
Only the three lines below are sent to ElevenLabs. Uses Python's standard library only.
"""
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "frontend" / "assets" / "audio"

# Who says what, in which ElevenLabs voice (premade voices every account has)
HELLOS = [
    ("vuthy", "Hello, I'm Vuthy!", "TX3LPaxmHKxFdv7VOQHJ"),   # Liam: young man, warm and clear
    ("timila", "Hello, I'm Timila!", "cgSgspJ2msm6clMCkdW9"),  # Jessica: young woman, bright
    ("vila", "Hello, I'm Vila!", "iP95p4xoKVk53GoZ742B"),     # Chris: man, relaxed and friendly
]
MODEL = "eleven_multilingual_v2"
SETTINGS = {"stability": 0.45, "similarity_boost": 0.8, "style": 0.35, "use_speaker_boost": True}


def api_key():
    key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    for env in (ROOT / "backend" / ".env", ROOT / "backend" / "optimizer" / ".env"):
        if key or not env.exists():
            continue
        for line in env.read_text().splitlines():
            name, _, value = line.partition("=")
            if name.strip() == "ELEVENLABS_API_KEY":
                key = value.strip().strip('"').strip("'")
    if not key:
        sys.exit("No ELEVENLABS_API_KEY: add ELEVENLABS_API_KEY=... to backend/optimizer/.env and run again.")
    return key


def secure():
    # Python from python.org on a Mac has no trusted certificates of its own until you run its
    # "Install Certificates" step, so use certifi's list when it's installed
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def speak(key, text, voice):
    request = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_128",
        data=json.dumps({"text": text, "model_id": MODEL, "voice_settings": SETTINGS}).encode(),
        headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60, context=secure()) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors="replace")[:300]
        sys.exit(f"ElevenLabs said {error.code} for {text!r}: {detail}")


def main():
    again = "--again" in sys.argv
    key = api_key()
    for name, text, voice in HELLOS:
        path = OUT / f"hello-{name}.mp3"
        if path.exists() and not again:
            print(f"kept   {path.relative_to(ROOT)}")
            continue
        audio = speak(key, text, voice)
        path.write_bytes(audio)
        print(f"made   {path.relative_to(ROOT)} ({len(audio) // 1024} KB)")


if __name__ == "__main__":
    main()
