from typing import AsyncGenerator, List, Optional, Any, Tuple
import logging

import litellm

from config import settings

log = logging.getLogger("uvicorn.error")

SYSTEM_PROMPT = (
    "You are a PDF reading assistant. "
    "Every answer must be grounded in the PDF excerpt the user provides in their message "
    "(section headed 'PDF document'). "
    "Use definitions, notation, and claims from that excerpt; connect the highlighted part "
    "to the surrounding paper (motivation, related work, method, results). "
    "If the excerpt is truncated, say so and reason only from what is shown. "
    "Reply in the same language as the user's latest question."
)


def _delta_chunks(delta: Any) -> List[Tuple[str, str]]:
    """Return (kind, text) where kind is 'reasoning' or 'content'."""
    out: List[Tuple[str, str]] = []
    if delta is None:
        return out

    def add_reasoning_then_content(d: dict) -> None:
        for key in ("reasoning_content", "reasoning"):
            v = d.get(key)
            if isinstance(v, str) and v:
                out.append(("reasoning", v))
        c = d.get("content")
        if isinstance(c, str) and c:
            out.append(("content", c))
        elif isinstance(c, list):
            for part in c:
                if isinstance(part, dict) and part.get("text"):
                    out.append(("content", str(part["text"])))

    if isinstance(delta, dict):
        add_reasoning_then_content(delta)
        return out

    for attr in ("reasoning_content", "reasoning"):
        v = getattr(delta, attr, None)
        if isinstance(v, str) and v:
            out.append(("reasoning", v))
    c = getattr(delta, "content", None)
    if isinstance(c, str) and c:
        out.append(("content", c))
    elif isinstance(c, list):
        for part in c:
            if isinstance(part, dict) and part.get("text"):
                out.append(("content", str(part["text"])))
    return out


def _chunk_chunks(chunk: Any) -> List[Tuple[str, str]]:
    try:
        choices = getattr(chunk, "choices", None)
        if choices is None and isinstance(chunk, dict):
            choices = chunk.get("choices")
        if not choices:
            return []
        ch0 = choices[0]
        delta = getattr(ch0, "delta", None)
        if delta is None and isinstance(ch0, dict):
            delta = ch0.get("delta")
        return _delta_chunks(delta)
    except (IndexError, TypeError, AttributeError) as e:
        log.debug("stream chunk parse skip: %s", e)
        return []


class LLMService:
    def __init__(self):
        self.cfg = settings

    def _build_messages(
        self,
        user_message: str,
        history: List[dict],
        context: str = "",
        selected_text: str = "",
    ) -> List[dict]:
        messages: List[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]

        for msg in history[-14:]:
            messages.append({"role": msg["role"], "content": msg["content"]})

        parts: List[str] = []
        ctx = (context or "").strip()
        if ctx:
            parts.append(
                "### PDF document (primary source — base every answer on this text)\n" + ctx
            )
        sel = (selected_text or "").strip()
        if sel:
            parts.append(
                "### Highlighted excerpt (user focus — explain it using the PDF above)\n" + sel
            )
        parts.append("### Current request\n" + (user_message or "").strip())
        messages.append({"role": "user", "content": "\n\n".join(parts)})
        return messages

    async def stream_chat(
        self,
        user_message: str,
        history: List[dict] | None = None,
        context: str = "",
        selected_text: str = "",
        model: Optional[str] = None,
    ) -> AsyncGenerator[Tuple[str, str], None]:
        history = history or []
        model_name = model or self.cfg.model
        messages = self._build_messages(user_message, history, context, selected_text)

        kwargs: dict = {
            "model": model_name,
            "messages": messages,
            "temperature": self.cfg.temperature,
            "max_tokens": self.cfg.max_tokens,
            "stream": True,
            "api_key": self.cfg.api_key,
        }
        if self.cfg.api_base:
            kwargs["api_base"] = self.cfg.api_base

        response = await litellm.acompletion(**kwargs)

        yielded = 0
        async for chunk in response:
            for kind, text in _chunk_chunks(chunk):
                yielded += 1
                yield (kind, text)

        if yielded == 0:
            log.warning(
                "LLM stream produced zero text tokens (model=%s).",
                model_name,
            )
