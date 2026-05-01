# Issue 追踪：GitHub

本项目的 Issue 和 PRD 使用 GitHub Issues。所有操作均通过 `gh` CLI 进行。

## 约定

- **创建 Issue**：`gh issue create --title "..." --body "..."`。多行正文使用 heredoc。
- **查看 Issue**：`gh issue view <number> --comments`，配合 `jq` 过滤评论和标签。
- **列出 Issue**：`gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`，可按 `--label` 和 `--state` 过滤。
- **评论**：`gh issue comment <number> --body "..."`
- **添加/移除标签**：`gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **关闭**：`gh issue close <number> --comment "..."`

通过 `git remote -v` 推断仓库信息 —— `gh` 在 clone 内运行时自动处理。

## 当技能说 "发布到 Issue 追踪器"

创建一个 GitHub Issue。

## 当技能说 "获取相关 ticket"

运行 `gh issue view <number> --comments`。
