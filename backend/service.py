"""Public integration boundary: no Streamlit imports, JSON-serializable results."""
from time import perf_counter
from config import load_config
from models import make_result
from compressors.qwen_agent import compress_with_qwen
from compressors.nlp_compressor import compress_with_nlp
from compressors.tfidf_compressor import compress_with_tfidf

def compare_methods(text: str, method_options: dict | None = None):
    options = dict(method_options or {})
    # A stray space or blank line from a phrases box would otherwise block every suggestion.
    if options.get("locked_spans") is not None:
        options["locked_spans"] = [span.strip() for span in options["locked_spans"] if span.strip()]
    encoding = options.get("encoding", "o200k_base")
    results = []
    for method in options.get("methods", ["qwen", "nlp", "tfidf"]):
        start = perf_counter()
        try:
            if method == "qwen":
                if not options.get("allow_external", False):
                    result = make_result(method, text, text, start, encoding,
                        ["Qwen skipped: explicit external-transfer consent is required."], "error")
                else:
                    result = compress_with_qwen(text, options.get("config") or load_config(),
                        options.get("locked_spans"), encoding, options.get("qwen_client"))
            elif method == "nlp":
                result = compress_with_nlp(text, options.get("locked_spans"), encoding,
                                           mode=options.get("nlp_mode", "conservative"))
            elif method == "tfidf":
                result = compress_with_tfidf(text, options.get("main_question", ""),
                    options.get("token_budget", 100), options.get("locked_sentences"), encoding,
                    options.get("locked_spans"))
            else:
                raise ValueError("Unknown compression method.")
        except Exception:
            # Isolate method failures; no raw exception or prompt logging.
            result = make_result(method, text, text, start, encoding,
                                 ["Method failed; verify dependencies and configuration."], "error")
        results.append(result)
    return results
