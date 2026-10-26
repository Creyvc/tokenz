from types import SimpleNamespace as NS
import httpx
import pytest
from openai import RateLimitError, AuthenticationError, BadRequestError, NotFoundError
from config import QwenConfig
from compressors.qwen_client import QwenClient
from compressors.qwen_agent import compress_with_qwen

def test_adapter_disables_retry_and_parses_usage(monkeypatch):
    calls = {}
    def create(**kwargs):
        calls["request"] = kwargs
        return NS(choices=[NS(message=NS(content="Explain gravity."), finish_reason="stop")],
                  usage=NS(prompt_tokens=12, completion_tokens=4, total_tokens=16,
                           completion_tokens_details=NS(reasoning_tokens=2)))
    def sdk(**kwargs):
        calls["init"] = kwargs
        return NS(chat=NS(completions=NS(create=create)))
    monkeypatch.setattr("compressors.qwen_client.OpenAI", sdk)
    config = QwenConfig(api_key="fake", base_url="https://example.invalid", temperature=None)
    proposal = QwenClient(config).propose([], 3)
    assert calls["init"]["max_retries"] == 0
    assert "temperature" not in calls["request"]
    assert calls["request"]["timeout"] == 3
    assert proposal.total_tokens == 16 and proposal.reasoning_tokens == 2

@pytest.mark.parametrize("error,status", [(RateLimitError,429), (AuthenticationError,401),
    (BadRequestError,400), (NotFoundError,404)])
def test_provider_errors_no_retry(error, status):
    class Broken:
        calls = 0
        def propose(self, *args, **kwargs):
            self.calls += 1
            response = httpx.Response(status, request=httpx.Request("POST", "https://example.invalid"))
            raise error("secret provider body", response=response, body=None)
    client = Broken()
    r = compress_with_qwen("Please explain gravity.", QwenConfig(api_key="fake", base_url="https://example.invalid"), client=client)
    assert r.status == "error" and client.calls == 1
    assert "secret provider body" not in str(r.warnings)
