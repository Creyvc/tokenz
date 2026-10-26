import os
from pathlib import Path

import tiktoken

os.environ.setdefault("TIKTOKEN_CACHE_DIR", str(Path(__file__).resolve().parents[1] / ".tokenizer-cache"))


class TokenCounter:
    def __init__(self, model="", fallback="o200k_base"):
        try:
            self.encoding = tiktoken.encoding_for_model(model)
            self.fallback_used = False
        except KeyError:
            self.encoding = tiktoken.get_encoding(fallback)
            self.fallback_used = True

    def count(self, text):
        return len(self.encoding.encode(text, disallowed_special=()))

    def metadata(self):
        return {"encoding": self.encoding.name, "fallback_used": self.fallback_used,
                "scope": "text only; billed request usage comes from provider"}
