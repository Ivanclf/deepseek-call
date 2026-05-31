# Deepseek Chat Page

Deepseek 接口调用页面，支持对话历史管理、流式返回展示以及深度思考功能。

**纯vibe coding 生成，包括这篇README**

## 项目功能

- **对话历史管理**：以 JSON 格式持久化存储对话历史，支持多会话切换
- **流式返回展示**：逐步展示 Deepseek 回复内容，营造边接收边渲染的体验
- **深度思考功能**：默认开启深度思考模式

## 技术栈

- **后端**：Node.js + Express
- **前端**：原生 HTML/CSS/JS（无框架依赖）
- **存储**：JSON 文件（`data/history/` 目录）

## 项目结构

```
vibe/
├── backend/
│   └── server.js          # 后端服务
├── frontend/
│   ├── index.html          # 页面入口
│   ├── style.css           # 样式文件
│   └── app.js              # 前端逻辑
├── data/
│   └── history/            # 对话历史存储目录
├── package.json
└── .env                    # 环境变量配置
```

## 初始化配置

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

在项目根目录创建 `.env` 文件，添加以下配置：

```env
DEEPSEEK_API_KEY=your-api-key-here
DEEPSEEK_API_URL=https://api.deepseek.com/chat/completions
```

### 3. 启动服务

```bash
npm start
```

服务启动后，访问 http://localhost:3000 即可使用。

## 对话历史

对话历史以 JSON 文件形式存储在 `data/history/` 目录下，每个对话对应一个独立的 JSON 文件，结构如下：

```json
{
  "conversationId": "conversation-2026-05-31T12-00-00-000Z",
  "createdAt": "2026-05-31T12:00:00.000Z",
  "updatedAt": "2026-05-31T12:30:00.000Z",
  "messages": [
    {
      "role": "user",
      "content": "你好，Deepseek！",
      "timestamp": "2026-05-31T12:01:00.000Z"
    },
    {
      "role": "assistant",
      "content": "你好！我能帮你什么？",
      "timestamp": "2026-05-31T12:01:20.000Z"
    }
  ]
}
```
