require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_DIR = path.resolve(__dirname, '../frontend');
const HISTORY_DIR = path.resolve(__dirname, '../data/history');
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || '';

if (!fs.existsSync(HISTORY_DIR)) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

app.use(bodyParser.json());
app.use(express.static(FRONTEND_DIR));
app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

function getConversationPath(conversationId) {
  return path.join(HISTORY_DIR, `${conversationId}.json`);
}

function listConversations() {
  return fs.readdirSync(HISTORY_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => path.basename(file, '.json'))
    .sort((a, b) => b.localeCompare(a));
}

function loadConversation(conversationId) {
  const filePath = getConversationPath(conversationId);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function saveConversation(conversation) {
  const filePath = getConversationPath(conversation.conversationId);
  fs.writeFileSync(filePath, JSON.stringify(conversation, null, 2), 'utf8');
}

function createConversation() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const conversationId = `conversation-${timestamp}`;
  const conversation = {
    conversationId,
    createdAt: new Date().toISOString(),
    messages: []
  };
  saveConversation(conversation);
  return conversation;
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/conversations', (req, res) => {
  const conversations = listConversations();
  res.json({ conversations });
});

app.post('/api/conversations', (req, res) => {
  const conversation = createConversation();
  res.json({ conversationId: conversation.conversationId });
});

app.get('/api/conversations/:conversationId', (req, res) => {
  const { conversationId } = req.params;
  const conversation = loadConversation(conversationId);
  if (!conversation) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }
  res.json({ conversationId: conversation.conversationId, messages: conversation.messages });
});

function buildDeepseekRequest(conversationId, messages) {
  const systemMessage = {
    role: 'system',
    content: 'You are a helpful assistant.'
  };
  return {
    model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro',
    messages: [systemMessage, ...messages],
    thinking: { type: 'enabled' },
    reasoning_effort: 'high',
    stream: false
  };
}

function streamTextChunks(res, text, prefix = '') {
  const chunks = text.match(/.{1,100}/g) || [text];
  let index = 0;
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (index >= chunks.length) {
        clearInterval(interval);
        resolve();
        return;
      }
      const output = index === 0 ? prefix + chunks[index] : chunks[index];
      res.write(output);
      index += 1;
    }, 200);
  });
}

function streamThinkingSteps(res, steps) {
  if (!steps || !steps.length) {
    return Promise.resolve();
  }
  const thinkingText = steps.map((step) => `思考过程：${step}\n`).join('');
  return streamTextChunks(res, thinkingText);
}

function simulateDeepseekStream(requestBody, res) {
  const historyCount = requestBody.messages.length;
  const thinkingSteps = [
    `收到历史消息 ${historyCount} 条，正在进行深度思考...`,
    '正在提取核心信息，并生成回答。',
    '整理回答结构：引导、说明、示例...'
  ];
  const answer = 'Deepseek 模拟响应：这是你当前问题的分析结果。';

  return new Promise(async (resolve) => {
    await streamThinkingSteps(res, thinkingSteps);
    await streamTextChunks(res, answer, '回答：');
    resolve(`${thinkingSteps.join(' ')} ${answer}`);
  });
}

function extractDeepseekText(responseJson) {
  if (!responseJson) return '';
  if (responseJson.error) {
    throw new Error(responseJson.error.message || JSON.stringify(responseJson.error));
  }

  if (responseJson.choices && responseJson.choices.length > 0) {
    const choice = responseJson.choices[0];
    if (choice.message && typeof choice.message.content === 'string') {
      return choice.message.content;
    }
    if (typeof choice.text === 'string') {
      return choice.text;
    }
    if (choice.delta && typeof choice.delta.content === 'string') {
      return choice.delta.content;
    }
  }

  if (typeof responseJson.content === 'string') {
    return responseJson.content;
  }

  return '';
}

async function streamRemoteDeepseekResponse(requestBody, res) {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('Missing DEEPSEEK_API_KEY environment variable');
  }
  if (!DEEPSEEK_API_URL) {
    throw new Error('Missing DEEPSEEK_API_URL environment variable');
  }

  const thinkingSteps = [
    'Deepseek 正在进行深度思考...',
    '分析问题背景和语境...',
    '生成回答结构与关键点...'
  ];
  await streamThinkingSteps(res, thinkingSteps);

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify(requestBody)
  });

  const responseBody = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(responseBody);
  } catch (err) {
    throw new Error(`Deepseek API returned non-JSON response: ${responseBody}`);
  }

  if (!response.ok) {
    throw new Error(`Deepseek API error ${response.status}: ${parsed.error?.message || responseBody}`);
  }

  const assistantText = extractDeepseekText(parsed);
  if (!assistantText) {
    throw new Error('Deepseek response did not include assistant content');
  }

  await streamTextChunks(res, assistantText, '回答：');
  return assistantText;
}

function appendMessage(conversation, message) {
  conversation.messages.push(message);
  saveConversation(conversation);
}

app.post('/api/conversations/:conversationId/stream', async (req, res) => {
  const { conversationId } = req.params;
  const { message } = req.body;

  if (!message || !message.role || !message.content) {
    res.status(400).json({ error: 'Invalid message payload' });
    return;
  }

  let conversation = loadConversation(conversationId);
  if (!conversation) {
    conversation = {
      conversationId,
      createdAt: new Date().toISOString(),
      messages: []
    };
    saveConversation(conversation);
  }

  appendMessage(conversation, message);

  const requestBody = buildDeepseekRequest(conversationId, conversation.messages);

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.flushHeaders();

  let assistantText = '';
  try {
    if (DEEPSEEK_API_URL && DEEPSEEK_API_KEY) {
      assistantText = await streamRemoteDeepseekResponse(requestBody, res);
    } else {
      assistantText = await simulateDeepseekStream(requestBody, res);
    }
  } catch (error) {
    res.write(`Deepseek 服务错误：${error.message}`);
    res.end();
    return;
  }

  const assistantMessage = {
    role: 'assistant',
    content: assistantText,
    timestamp: new Date().toISOString()
  };
  appendMessage(conversation, assistantMessage);
});

app.listen(PORT, () => {
  console.log(`Deepseek page server started on http://localhost:${PORT}`);
});