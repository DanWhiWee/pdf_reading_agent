import os
from pathlib import Path
from dataclasses import dataclass

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
UPLOAD_DIR = BASE_DIR / "uploads"
DATA_DIR = BASE_DIR / "data"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)


def _load_env_file():
    """Manually parse .env to guarantee loading on Windows."""
    candidates = [
        PROJECT_DIR / ".env",
        Path.cwd().parent / ".env",
        Path.cwd() / ".env",
    ]
    for env_path in candidates:
        if env_path.is_file():
            print(f"[config] Loading .env from: {env_path}")
            with open(env_path, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if "=" not in line:
                        continue
                    key, _, value = line.partition("=")
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")
                    if key:
                        os.environ[key] = value
            return
    print(f"[config] WARNING: .env not found in any of: {[str(p) for p in candidates]}")


_load_env_file()

_api_key = os.getenv("LLM_API_KEY", "")
if _api_key:
    os.environ["OPENAI_API_KEY"] = _api_key
    print(f"[config] LLM_MODEL={os.getenv('LLM_MODEL')}, API key loaded (len={len(_api_key)})")
else:
    print("[config] WARNING: LLM_API_KEY is empty!")


@dataclass
class LLMConfig:
    model: str = os.getenv("LLM_MODEL", "gpt-4o-mini")
    api_key: str = os.getenv("LLM_API_KEY", "")
    api_base: str = os.getenv("LLM_API_BASE", "")
    temperature: float = float(os.getenv("LLM_TEMPERATURE", "0.7"))
    max_tokens: int = int(os.getenv("LLM_MAX_TOKENS", "4096"))


settings = LLMConfig()

# Truncate extracted PDF text for chat context (smaller = faster & cheaper; set in .env)
PDF_CONTEXT_MAX_CHARS = int(os.getenv("PDF_CONTEXT_MAX_CHARS", "24000"))
