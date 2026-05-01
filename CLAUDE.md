# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

PDF 阅读 Agent —— 左侧 PDF 阅读器、右侧 AI 对话面板的分栏 Web 应用。对话具备上下文感知能力：优先使用 RAG 检索当前 PDF，无索引时回退为直接提取文本。前端为 React + Vite（TypeScript），后端为 Python FastAPI。

## 开发命令

**首次安装（Windows）：**
```bat
setup-once.bat
cp .env.example .env   # 填写 LLM_API_KEY
```

**首次安装（macOS/Linux）：**
```bash
chmod +x scripts/setup-once.sh && ./scripts/setup-once.sh
cp .env.example .env
```

**开发运行 —— 两个终端：**
```bash
# 终端 1 — 后端（端口 8000）
cd backend && python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000

# 终端 2 — 前端（端口 5173）
cd frontend && npm run dev
```
Windows 快捷方式：`start.bat`（自动清理端口并启动两个服务器）。

**前端构建：**
```bash
cd frontend && npm run build   # tsc + vite 打包 → frontend/dist/
```

**健康检查：** `GET http://127.0.0.1:8000/api/health`

暂无自动化测试套件。

## 架构

### 请求流程

```
浏览器（React SPA，:5173）
  │  Vite dev proxy：/api/* → :8000
  │
  ├─ 上传 PDF  ──POST /api/pdf/upload──► FastAPI
  │                                       PDFService.save_and_parse()
  │                                       + 后台：RAGService.build_index()
  │
  ├─ 加载 PDF  ──GET /api/pdf/{id}/file──► FileResponse（原始字节）
  │             ArrayBuffer → EmbedPDF WASM worker（PDFium）
  │
  ├─ 对话      ──POST /api/chat/stream──► ChatRouter（SSE）
  │             RAGService.retrieve()  [FAISS 索引就绪时]
  │             or PDFService.extract_context()  [回退]
  │             LLMService.stream_chat() via LiteLLM
  │             产出 (kind, token) SSE 事件
  │
  ├─ 搜索      ──GET /api/pdf/{id}/search?q=──► PDFService.search_text()（PyMuPDF）
  │
  └─ 标注      ──GET/PUT /api/pdf/{id}/annotations──► JSON sidecar 文件
```

### 后端（`backend/`）

| 文件 | 职责 |
|---|---|
| `main.py` | FastAPI 应用，挂载 `/api/pdf` 和 `/api/chat` 路由 |
| `config.py` | 加载 `.env`，暴露 `settings: LLMConfig` 单例和 `PDF_CONTEXT_MAX_CHARS` |
| `routers/pdf.py` | PDF 增删改查、标注、全文搜索接口 |
| `routers/chat.py` | SSE 流式对话接口 |
| `services/pdf_service.py` | PyMuPDF：上传解析、文本提取、搜索（去连字符）、标注 JSON sidecar |
| `services/llm_service.py` | LiteLLM `acompletion` 封装；产出 `(kind, token)`，kind 为 `"reasoning"` 或 `"content"` |
| `services/rag_service.py` | 基于 `sentence-transformers` 的 per-doc FAISS 索引；当前页命中加权提升 |
| `models/schemas.py` | Pydantic 模型：`ChatRequest`、`DocumentMeta` 等 |

上传的 PDF 存于 `backend/uploads/`，FAISS 索引存于 `backend/data/`，均已 gitignore。

### 前端（`frontend/src/`）

| 路径 | 职责 |
|---|---|
| `App.tsx` | 根布局 —— Allotment 分栏（对话 ↔ PDF） |
| `stores/appStore.ts` | Zustand 全局状态：当前文档、消息列表、文本选择、PDF 导航目标、搜索状态、阅读背景色、面板折叠。活跃文档用 `sessionStorage` 持久化；背景色和折叠状态用 `localStorage` 持久化。 |
| `services/api.ts` | 所有对后端的 `fetch` 调用 |
| `hooks/useChat.ts` | 构建 SSE 流，分别累积 `reasoning` 和 `content` token |
| `components/PDFViewer/PdfiumViewer.tsx` | 核心渲染器 —— EmbedPDF + PDFium WASM，含插件：viewport、scroll、render、search、selection、annotation、zoom、history、export |
| `components/PDFViewer/PDFToolbar.tsx` | 上传、缩放、导航、搜索栏、背景色选择、标注导出 |
| `components/ChatPanel/` | `ChatPanel.tsx`（历史记录）、`ChatInput.tsx`（输入与发送/停止）、`MessageItem.tsx`（Markdown + KaTeX + 推理块渲染） |
| `utils/thinkingParse.ts` | 解析 LLM 输出中的 `<think>` 标签，用于可折叠推理展示 |
| `utils/ragPoll.ts` | 上传后轮询 `/rag-status` 直到索引就绪 |

### 配置（`.env`）

关键变量（完整列表见 `.env.example`）：

| 变量 | 说明 |
|---|---|
| `LLM_MODEL` | LiteLLM 模型标识（默认 `gpt-4o-mini`） |
| `LLM_API_KEY` | LLM 提供方的 API Key |
| `LLM_API_BASE` | 可选自定义 Base URL（Ollama、Qwen、第三方网关） |
| `RAG_ENABLED` | 是否启用 FAISS RAG（默认 `true`） |
| `PDF_CONTEXT_MAX_CHARS` | 每轮对话注入的 PDF 文本最大字符数（默认 `24000`） |

### 当前分支说明

活跃分支 `feat/pdfium-migration` 正在迁移至 EmbedPDF/PDFium WASM 渲染器，`backend/routers/pdf.py` 有未提交的改动。

## Agent skills

### Issue 追踪

Issue 使用 GitHub Issues 追踪，通过 `gh` CLI 操作。详见 `docs/agents/issue-tracker.md`。

### 分类标签

五个标准标签：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`。详见 `docs/agents/triage-labels.md`。

### 领域文档

单上下文布局 —— 根目录一个 `CONTEXT.md` + `docs/adr/` 存放架构决策。详见 `docs/agents/domain.md`。
