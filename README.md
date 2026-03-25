# PDF 阅读助手

在浏览器中上传 PDF，结合文档内容与选中片段，向大模型提问；支持流式回答、思考过程单独折叠展示。后端为 **FastAPI**，前端为 **React + Vite**，模型调用经 **LiteLLM**，可对接 OpenAI 兼容接口、通义、DeepSeek、Ollama 等。

## 功能概览

- PDF 上传与渲染（文本可选中复制）
- 划选 PDF 文字后一键带入上下文提问
- SSE 流式输出；若接口返回推理字段，思考过程与正文分区展示，结束后思考区默认收起，仍可手动展开
- 工具栏：缩放、翻页；会话内会记住当前打开的文档（sessionStorage）
- **Phase 2**：上传后自动构建 **FAISS 向量索引**，对话按语义检索相关片段（RAG）；回答结束可点 **来源** 跳转页码并高亮；**目录侧栏**；工具栏 **文档内搜索**（PyMuPDF 文本匹配）。索引未就绪时自动回退为原来的按页全文摘录。

## 环境要求

- **Python** 3.10+（建议）
- **Node.js** 18+ 与 npm

## 快速开始

### 1. 配置环境变量

在项目根目录复制示例文件并编辑：

```bash
cp .env.example .env
```

至少填写 **`LLM_API_KEY`**，并按服务商设置 **`LLM_MODEL`**；使用通义、Ollama 等时需配置 **`LLM_API_BASE`**。可选 **`PDF_CONTEXT_MAX_CHARS`**（默认 24000）：数值越小，每次注入的 PDF 字数越少，通常更快、更省 token。

RAG 相关变量（`RAG_*`、`RAG_ENABLED`）见 **`.env.example`**。首次启用会下载嵌入模型，体积较大，需较长时间；若 `pip install` 失败，可暂时设置 **`RAG_ENABLED=false`**，仅使用全文摘录模式。

### 2. 安装依赖并启动

**后端**（终端一）：

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

**前端**（终端二）：

```bash
cd frontend
npm install
npm run dev
```

浏览器访问：**http://localhost:5173**（开发模式下 Vite 会将 `/api` 代理到 `http://127.0.0.1:8000`）。

### Windows 一键启动

双击根目录 **`start.bat`**：会先执行 **`kill-dev-ports.bat`** 释放 **8000 / 5173 / 5174** 上可能残留的旧进程，再分别启动后端与前端，并尝试打开浏览器。若缺少 `.env`，会从 `.env.example` 复制一份，请记得填入密钥。

仅需结束占用端口而不启动服务时，可使用 **`stop.bat`** 或单独运行 **`kill-dev-ports.bat`**。

## 前端直连后端（可选）

默认通过 Vite 代理访问 API。若你把前端静态资源单独部署、没有同源代理，可在构建或开发环境中设置环境变量 **`VITE_API_BASE`**（例如 `http://127.0.0.1:8000`），详见 `frontend/src/services/api.ts`。

## 常见问题

| 现象 | 建议 |
|------|------|
| 关闭窗口后端口仍被占用、改代码不生效 | 使用 **`start.bat`** 或先运行 **`kill-dev-ports.bat`** 再启动 |
| 页面像旧版本 | 浏览器 **`Ctrl + F5`** 强制刷新或清缓存 |
| 回答很慢 | 换用更快模型，或适当降低 **`PDF_CONTEXT_MAX_CHARS`** |
| 选中一段后模型仍问「要解释哪段」 | 当前实现已用 ref 缓存选区并随请求发送；若仍异常，可硬刷新后重试 |

## 仓库说明

- **`.env`** 含密钥，已在 **`.gitignore`** 中忽略；勿提交。
- 上传的 PDF 与解析数据默认在 **`backend/uploads/`**、**`backend/data/`**，通常也不纳入版本库。

## 技术栈

Python（FastAPI、PyMuPDF、LiteLLM、faiss-cpu、sentence-transformers）· React（TypeScript、Zustand、react-pdf、Ant Design）· Vite
