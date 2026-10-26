"""Run from the project root: python -m examples.frontend_handoff.

This uses synthetic text and local methods only. It does not call Qwen.
The printed JSON is an interface example, not a new benchmark.
"""
import json
from service import compare_methods


def main():
    text = (
        "Explain photosynthesis. "
        "The chlorophyll absorbs sunlight for plant growth. "
        "Yesterday the weather near the old bus station was cloudy and rainy."
    )
    results = compare_methods(text, {
        "methods": ["nlp", "tfidf"],
        "encoding": "o200k_base",
        "main_question": "Explain photosynthesis.",
        "token_budget": 16,
        "locked_spans": [],
        "locked_sentences": [],
        "allow_external": False,
    })
    print(json.dumps([result.to_dict() for result in results], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
