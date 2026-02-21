"""Configuration loading from environment variables and CLI flags."""

import os
from dataclasses import dataclass
from enum import Enum
from typing import Optional


class Provider(str, Enum):
    ANTHROPIC = "anthropic"
    OPENAI = "openai"


DEFAULTS = {
    Provider.ANTHROPIC: "claude-sonnet-4-6",
    Provider.OPENAI: "gpt-4o",
}

ENV_KEYS = {
    Provider.ANTHROPIC: "ANTHROPIC_API_KEY",
    Provider.OPENAI: "OPENAI_API_KEY",
}


@dataclass
class Config:
    provider: Provider
    model: str
    api_key: str

    @classmethod
    def from_env(
        cls,
        provider: Provider,
        model_override: Optional[str] = None,
        api_key_override: Optional[str] = None,
    ) -> "Config":
        model = model_override or DEFAULTS[provider]
        api_key = api_key_override or os.environ.get(ENV_KEYS[provider], "")
        if not api_key:
            raise RuntimeError(
                f"No API key for {provider.value}. "
                f"Set {ENV_KEYS[provider]} in your environment or .env file."
            )
        return cls(provider=provider, model=model, api_key=api_key)
