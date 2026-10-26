import pytest

from app.config import ProviderConfig, Settings


@pytest.fixture
def cfg(tmp_path):
    providers = {name: ProviderConfig(name, 'test-model', 'https://example.test/v1', 'secret-not-logged', 1., 2.)
                 for name in ('openai', 'qwen', 'deepseek')}
    return Settings(providers=providers, database=tmp_path / 'test.sqlite', delay=0)
