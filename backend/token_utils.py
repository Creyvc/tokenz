"""Local prompt-text measurement, never provider billing measurement."""
from functools import lru_cache
import os
from pathlib import Path
import tiktoken

# A stable project cache also works across isolated Windows test processes.
os.environ.setdefault("TIKTOKEN_CACHE_DIR", str(Path(__file__).parent / ".cache" / "tiktoken"))

@lru_cache(maxsize=4)
def get_encoding(name: str):
    return tiktoken.get_encoding(name)

def count_tokens(text: str, encoding_name: str = "o200k_base") -> int:
    # Special-token-looking user text is ordinary input, not tokenizer control.
    return len(get_encoding(encoding_name).encode(text, disallowed_special=()))
