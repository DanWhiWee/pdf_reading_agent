# PDF Reading Agent

A local web application for reading PDFs with an AI-powered Q&A assistant.

## Quick Start

### 1. Configure LLM

```bash
cp .env.example .env
# Edit .env with your API key and model choice
```

### 2. Start Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### 3. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

### Windows: `start.bat` / ports stuck

- **`start.bat`** 会先运行 **`kill-dev-ports.bat`**，结束占用 **8000、5173、5174** 的旧进程，再启动后端和前端，避免关掉窗口后端口仍被占用、跑的还是旧进程。
- 需要**只清端口、不启动**时，双击 **`stop.bat`**（或单独运行 **`kill-dev-ports.bat`**）。
- 若浏览器仍像旧版，对页面 **`Ctrl+F5` 硬刷新**（或清缓存）。

### 选中文字后模型仍问「要解释哪段」

- 点击 **Ask about this** 时浏览器会清空选区，旧逻辑用 `getSelection()` 会读到空串，左侧状态里其实没有选中文本。现已用 **ref 缓存选区**，并把选区合并进发给 API 的 `message`（与 `selected_text` 字段双保险）。

### 响应偏慢

- **`qvq-max`** 等推理/视觉模型本身较慢；可在 `.env` 设置 **`PDF_CONTEXT_MAX_CHARS`**（默认 24000）减小注入正文字数，或换用 **`openai/qwen-plus`** 等纯文本模型做对比。

### 回答只解释选中句、不看全文

- 后端已把 **PDF 正文放在 `user` 消息**里（带 `### PDF document` 标题），系统提示只保留短规则，兼容 DashScope 等对超长 `system` 支持较差的情况。
- 有选中文本时会传 **页码**，上下文按 **选中页为中心** 向两侧扩展，再受 `PDF_CONTEXT_MAX_CHARS` 限制。

## Features

- PDF upload and rendering with text layer
- Select text in PDF to ask context-aware questions
- Streaming LLM responses (SSE)
- Supports multiple LLM providers via LiteLLM (OpenAI, DeepSeek, Zhipu, Qwen, Ollama)
- Zoom, page navigation, document info toolbar
