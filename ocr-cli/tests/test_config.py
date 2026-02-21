"""Tests for ocr_cli.config — Config.from_env() and Provider enum."""

import pytest

from ocr_cli.config import Config, Provider, DEFAULTS, ENV_KEYS


class TestProviderEnum:
    def test_anthropic_value(self):
        assert Provider.ANTHROPIC.value == "anthropic"

    def test_openai_value(self):
        assert Provider.OPENAI.value == "openai"

    def test_string_equality(self):
        # Provider(str, Enum) means Provider.ANTHROPIC == "anthropic"
        assert Provider.ANTHROPIC == "anthropic"
        assert Provider.OPENAI == "openai"

    def test_construction_from_string(self):
        assert Provider("anthropic") is Provider.ANTHROPIC
        assert Provider("openai") is Provider.OPENAI


class TestConfigFromEnv:
    # ── Default model resolution ─────────────────────────────────────────

    def test_uses_default_model_for_anthropic(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
        config = Config.from_env(Provider.ANTHROPIC)
        assert config.model == DEFAULTS[Provider.ANTHROPIC]

    def test_uses_default_model_for_openai(self, monkeypatch):
        monkeypatch.setenv("OPENAI_API_KEY", "sk-oai-test")
        config = Config.from_env(Provider.OPENAI)
        assert config.model == DEFAULTS[Provider.OPENAI]

    def test_model_override_takes_precedence_over_default(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
        config = Config.from_env(Provider.ANTHROPIC, model_override="claude-custom-v1")
        assert config.model == "claude-custom-v1"

    def test_model_override_for_openai(self, monkeypatch):
        monkeypatch.setenv("OPENAI_API_KEY", "sk-oai-test")
        config = Config.from_env(Provider.OPENAI, model_override="gpt-4-turbo")
        assert config.model == "gpt-4-turbo"

    # ── API key resolution ───────────────────────────────────────────────

    def test_api_key_read_from_env_anthropic(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-from-env")
        config = Config.from_env(Provider.ANTHROPIC)
        assert config.api_key == "sk-ant-from-env"

    def test_api_key_read_from_env_openai(self, monkeypatch):
        monkeypatch.setenv("OPENAI_API_KEY", "sk-oai-from-env")
        config = Config.from_env(Provider.OPENAI)
        assert config.api_key == "sk-oai-from-env"

    def test_api_key_override_takes_precedence_over_env(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "env-key-should-not-be-used")
        config = Config.from_env(Provider.ANTHROPIC, api_key_override="direct-key")
        assert config.api_key == "direct-key"

    def test_openai_reads_openai_env_var_not_anthropic(self, monkeypatch):
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        monkeypatch.setenv("ANTHROPIC_API_KEY", "wrong-key")
        with pytest.raises(RuntimeError):
            Config.from_env(Provider.OPENAI)

    # ── Missing key errors ───────────────────────────────────────────────

    def test_raises_runtime_error_without_anthropic_key(self, monkeypatch):
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        with pytest.raises(RuntimeError):
            Config.from_env(Provider.ANTHROPIC)

    def test_raises_runtime_error_without_openai_key(self, monkeypatch):
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        with pytest.raises(RuntimeError):
            Config.from_env(Provider.OPENAI)

    def test_error_message_names_the_env_var(self, monkeypatch):
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        with pytest.raises(RuntimeError, match="ANTHROPIC_API_KEY"):
            Config.from_env(Provider.ANTHROPIC)

    def test_error_message_names_the_provider(self, monkeypatch):
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        with pytest.raises(RuntimeError, match="openai"):
            Config.from_env(Provider.OPENAI)

    # ── Returned config fields ───────────────────────────────────────────

    def test_provider_field_stored(self, monkeypatch):
        monkeypatch.setenv("OPENAI_API_KEY", "k")
        config = Config.from_env(Provider.OPENAI)
        assert config.provider is Provider.OPENAI

    def test_all_fields_populated(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "my-key")
        config = Config.from_env(Provider.ANTHROPIC, model_override="m")
        assert config.provider is Provider.ANTHROPIC
        assert config.model == "m"
        assert config.api_key == "my-key"
