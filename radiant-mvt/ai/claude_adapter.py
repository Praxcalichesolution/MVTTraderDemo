import warnings
try:
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
except Exception:
    pass
import ssl
import os
import httpx

# Fix SSL certificate verification for corporate networks
try:
    ssl._create_default_https_context = ssl._create_unverified_context
except Exception:
    pass

import anthropic
from typing import AsyncGenerator
from dotenv import load_dotenv

load_dotenv()

MODEL = "claude-sonnet-4-6"  # Use available model


def get_client():
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key or api_key.startswith("sk-placeholder") or api_key == "your_key_here":
        return None
    # Use httpx client with SSL verification disabled for corporate networks
    http_client = httpx.Client(verify=False, trust_env=False)
    return anthropic.Anthropic(api_key=api_key, http_client=http_client)


async def generate_claude(
    system_prompt: str,
    user_prompt: str,
    stream: bool = True,
    model: str | None = None,
    max_tokens: int = 1500,
    temperature: float | None = None,
) -> AsyncGenerator[str, None]:
    client = get_client()
    if not client:
        yield "[Claude API key not configured]"
        return
    target_model = model or MODEL
    base_payload = {
        "model": target_model,
        "max_tokens": max_tokens,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_prompt}],
    }
    if temperature is not None:
        base_payload["temperature"] = temperature
    try:
        # Try streaming first
        try:
            with client.messages.stream(**base_payload) as s:
                for text in s.text_stream:
                    yield text
        except AttributeError:
            # Fallback for older anthropic versions - use create with stream=True
            response = client.messages.create(**{**base_payload, "stream": True})
            for event in response:
                if hasattr(event, 'delta') and hasattr(event.delta, 'text'):
                    yield event.delta.text
                elif hasattr(event, 'type') and event.type == 'content_block_delta':
                    yield getattr(event.delta, 'text', '')
    except Exception as e:
        error_msg = str(e)
        if 'api_key' in error_msg.lower() or 'auth' in error_msg.lower():
            yield f"[Authentication error — check ANTHROPIC_API_KEY in .env]"
        elif 'model' in error_msg.lower():
            yield f"[Model error: {error_msg[:100]}]"
        else:
            yield f"[Claude error: {error_msg[:150]}]"


async def extract_with_tool_claude(system_prompt: str, user_prompt: str, tools: list) -> dict:
    """Use Claude tool use for structured parameter extraction"""
    client = get_client()
    if not client:
        return {"success": False, "error": "No API key"}
    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=system_prompt,
            tools=tools,
            messages=[{"role": "user", "content": user_prompt}]
        )
        for block in response.content:
            if block.type == "tool_use":
                return {"tool_name": block.name, "parameters": block.input, "success": True}
        return {"success": False, "raw": response.content[0].text if response.content else ""}
    except Exception as e:
        return {"success": False, "error": str(e)}
