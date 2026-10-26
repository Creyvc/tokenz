"""Single-request provider adapter; all SDK retries are disabled."""
from dataclasses import dataclass
from openai import OpenAI

@dataclass
class Proposal:
    text: str
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None
    reasoning_tokens: int | None = None
    truncated: bool = False

class QwenClient:
    def __init__(self, config):
        self.config = config
        self.client = OpenAI(api_key=config.api_key, base_url=config.base_url, max_retries=0)

    def propose(self, messages, timeout: float) -> Proposal:
        c = self.config
        options = dict(model=c.model, messages=messages, max_tokens=c.max_output_tokens,
                       timeout=timeout)
        if c.temperature is not None:
            options["temperature"] = c.temperature
        if c.enable_thinking is not None:
            options["extra_body"] = {"enable_thinking": c.enable_thinking}
        response = self.client.chat.completions.create(**options)
        usage = response.usage
        choice = response.choices[0] if response.choices else None
        details = getattr(usage, "completion_tokens_details", None)
        return Proposal(
            (choice.message.content or "") if choice else "",
            getattr(usage, "prompt_tokens", None), getattr(usage, "completion_tokens", None),
            getattr(usage, "total_tokens", None), getattr(details, "reasoning_tokens", None),
            choice is not None and choice.finish_reason == "length")
