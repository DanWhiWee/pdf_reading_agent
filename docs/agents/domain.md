# 领域文档

工程技能在探索代码库时，应如何消费本项目的领域文档。

## 探索前先读这些

- **`CONTEXT.md`**（项目根目录），或
- **`CONTEXT-MAP.md`**（项目根目录，如果存在）—— 指向每个上下文的 `CONTEXT.md`。只读与当前主题相关的部分。
- **`docs/adr/`** —— 阅读与你即将工作的领域相关的 ADR。在多上下文中，也要检查 `src/<context>/docs/adr/`。

如果这些文件不存在，**静默跳过即可**。不要标记缺失、不要建议创建。生产端技能（`/grill-with-docs`）会在术语或决策实际被确定时惰性创建它们。

## 文件结构

单上下文仓库（大多数项目）：

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

多上下文仓库（根目录存在 `CONTEXT-MAP.md`）：

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← 系统级决策
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← 上下文专属决策
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## 使用术语表中的词汇

当你的输出命名一个领域概念时（在 Issue 标题、重构建议、假设、测试名称中），使用 `CONTEXT.md` 中定义的术语。不要使用术语表明确回避的同义词。

如果你需要的概念尚未收录到术语表中，这是一个信号 —— 要么你在发明项目不使用的语言（重新考虑），要么存在真正的空白（标注出来供 `/grill-with-docs` 使用）。

## 标记 ADR 冲突

如果你的输出与现有 ADR 矛盾，要明确指出而不是静默覆盖：

> _与 ADR-0007（事件溯源订单）矛盾 —— 但值得重新讨论，因为…_
