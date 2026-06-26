import os
import json
import yaml
from typing import AsyncGenerator, Optional


def load_config():
    config_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config.yaml")
    with open(config_path) as f:
        return yaml.safe_load(f)


class AIClient:
    def __init__(self):
        self.config = load_config()
        self.provider = self.config.get('ai', {}).get('provider', 'claude')

    def set_provider(self, provider: str):
        self.provider = provider

    def _get_local_config(self):
        """Get local LLM URL and model from DB connector, fallback to config.yaml."""
        fallback = {
            'url': self.config.get('ai', {}).get('local_url', 'http://localhost:1234/v1'),
            'model': self.config.get('ai', {}).get('local_model', 'llama-3.1-8b-instruct'),
        }
        try:
            from database.db import SessionLocal, get_active_ai_connector
            db = SessionLocal()
            try:
                connector = get_active_ai_connector(db)
                if connector and connector[1]:  # host_url is index 1
                    extra = {}
                    try:
                        extra = json.loads(connector[2] or '{}')
                    except Exception:
                        extra = {}
                    return {
                        'url': connector[1].rstrip('/'),
                        'model': extra.get('model', fallback['model']),
                    }
            finally:
                db.close()
        except Exception:
            pass
        return fallback

    async def generate(self, system_prompt: str, user_prompt: str, stream: bool = True) -> AsyncGenerator[str, None]:
        if self.provider == 'local':
            from ai.local_adapter import generate_local
            local_cfg = self._get_local_config()
            async for chunk in generate_local(system_prompt, user_prompt, stream,
                                              base_url=local_cfg['url'], model=local_cfg['model']):
                yield chunk
        else:
            from ai.claude_adapter import generate_claude
            async for chunk in generate_claude(system_prompt, user_prompt, stream):
                yield chunk

    async def generate_full(self, system_prompt: str, user_prompt: str) -> str:
        """Non-streaming version - returns complete response"""
        result = []
        async for chunk in self.generate(system_prompt, user_prompt, stream=False):
            result.append(chunk)
        return "".join(result)

    async def use_tool(self, system_prompt: str, user_prompt: str, tools: list) -> dict:
        """Tool use for structured parameter extraction (Curve Shifter etc)"""
        if self.provider == 'local':
            from ai.local_adapter import extract_with_tool_local
            local_cfg = self._get_local_config()
            return await extract_with_tool_local(system_prompt, user_prompt, tools,
                                                 base_url=local_cfg['url'], model=local_cfg['model'])
        else:
            from ai.claude_adapter import extract_with_tool_claude
            return await extract_with_tool_claude(system_prompt, user_prompt, tools)

    def get_status(self) -> dict:
        local_cfg = self._get_local_config() if self.provider == 'local' else {}
        return {
            "provider": self.provider,
            "claude_model": self.config.get('ai', {}).get('claude_model', 'claude-sonnet-4-6'),
            "local_url": local_cfg.get('url', self.config.get('ai', {}).get('local_url', 'http://localhost:1234/v1')),
            "data_egress": "Cloud (encrypted)" if self.provider == 'claude' else "Zero — On-Premise only",
        }


# Singleton
ai_client = AIClient()
