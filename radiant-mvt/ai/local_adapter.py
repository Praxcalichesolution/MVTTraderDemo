import os
import httpx
from typing import AsyncGenerator
from dotenv import load_dotenv

load_dotenv()

LOCAL_URL = os.getenv("LOCAL_LLM_URL", "http://localhost:1234/v1")
LOCAL_MODEL = os.getenv("LOCAL_LLM_MODEL", "llama-3.1-8b-instruct")


async def generate_local(system_prompt: str, user_prompt: str, stream: bool = True) -> AsyncGenerator[str, None]:
    """OpenAI-compatible endpoint for LM Studio"""
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            payload = {
                "model": LOCAL_MODEL,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "max_tokens": 1024,
                "stream": stream,
                "temperature": 0.3
            }
            if stream:
                async with client.stream("POST", f"{LOCAL_URL}/chat/completions", json=payload) as resp:
                    async for line in resp.aiter_lines():
                        if line.startswith("data: ") and line != "data: [DONE]":
                            import json
                            try:
                                data = json.loads(line[6:])
                                delta = data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                                if delta:
                                    yield delta
                            except:
                                pass
            else:
                resp = await client.post(f"{LOCAL_URL}/chat/completions", json={**payload, "stream": False})
                data = resp.json()
                yield data["choices"][0]["message"]["content"]
    except Exception as e:
        yield f"[Local LLM unavailable — ensure LM Studio is running on port 1234: {str(e)[:80]}]"


async def extract_with_tool_local(system_prompt: str, user_prompt: str, tools: list) -> dict:
    """Fallback: ask local model to return JSON directly"""
    schema = tools[0].get("input_schema", {}) if tools else {}
    augmented_prompt = f"{user_prompt}\n\nReturn ONLY a JSON object with these fields: {list(schema.get('properties', {}).keys())}"

    result = ""
    async for chunk in generate_local(system_prompt, augmented_prompt, stream=False):
        result += chunk

    import json, re
    try:
        match = re.search(r'\{.*\}', result, re.DOTALL)
        if match:
            return {"success": True, "parameters": json.loads(match.group()), "tool_name": tools[0].get("name", "extract")}
    except:
        pass
    return {"success": False, "raw": result}
