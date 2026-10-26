"""Snapshot verified against the public OpenRouter catalog on 2026-10-24.

Every actual completion rechecks current availability and zero pricing.
"""
FREE_MODELS = {
    "liquid/lfm-2.5-2.6b:free": "LFM2.5-2.6B (free)",
    "google/gemma-4-31b-it:free": "Gemma 4 31B (free)",
    "google/gemma-4-26b-a4b-it:free": "Gemma 4 26B A4B (free)",
    "nvidia/nemotron-3.5-lightning:free": "Nemotron 3.5 Lightning (free)",
    "thinkingmachines/inkling-small:free": "Inkling Small (free)",
    "thinkingmachines/inkling:free": "Inkling (free)",
    "poolside/laguna-s-2.1:free": "Laguna S 2.1 (free)",
    "poolside/laguna-xs-2.1:free": "Laguna XS 2.1 (free)",
    "cohere/north-mini-code:free": "North Mini Code (free)",
    "dots-studio/dots-3-note-preview:free": "Dots3-Note Preview (free)",
    "nvidia/nemotron-3-ultra-550b-a55b:free": "Nemotron 3 Ultra (free)",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": "Nemotron 3 Nano Omni (free)",
    "nvidia/nemotron-3-super-120b-a12b:free": "Nemotron 3 Super (free)",
    "openrouter/free": "Free Models Router (optimizer only; varies by request)",
}
