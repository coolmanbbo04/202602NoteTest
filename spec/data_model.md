# 数据模型（v1）

> 目标：支持便签 CRUD + 分享；前端离线草稿与 Pin 使用 localStorage，不进后端。

## 1) 表：notes
| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | int/bigint | PK, auto increment | 便签 ID |
| title | varchar/text | nullable | 标题可为空 |
| content | text | not null default "" | 正文 |
| share_id | varchar | unique, nullable | 分享标识，用于 /share/{share_id} |
| created_at | datetime/timestamp | not null | 创建时间 |
| updated_at | datetime/timestamp | not null | 更新时间（用于排序/冲突检测） |

### 索引建议
- idx_notes_updated_at (updated_at desc)
- uq_notes_share_id (share_id unique)

## 2) 本地存储（前端）
### 2.1 Pin（置顶）
- key: notepad:pins:v1
- value: JSON object: { [noteId:number]: true }

### 2.2 Draft（离线草稿）
- key: notepad:draft:v1:{id}
- value:
  - ts: number (ms)
  - title: string|null
  - content: string
  - baseUpdatedAt: string|null (加载时服务器 updated_at)
