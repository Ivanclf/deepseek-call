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
    .map((file) => {
      const filePath = path.join(HISTORY_DIR, file);
      const raw = fs.readFileSync(filePath, 'utf8');
      const conversation = JSON.parse(raw);
      const lastMessage = conversation.messages.length > 0 
        ? conversation.messages[conversation.messages.length - 1].content 
        : '';
      return {
        id: path.basename(file, '.json'),
        lastMessage: lastMessage.substring(0, 50) + (lastMessage.length > 50 ? '...' : ''),
        timestamp: conversation.updatedAt || conversation.createdAt
      };
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
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
  conversation.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(conversation, null, 2), 'utf8');
}

function createConversation() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const conversationId = `conversation-${timestamp}`;
  const conversation = {
    conversationId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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

app.delete('/api/conversations/:conversationId', (req, res) => {
  const { conversationId } = req.params;
  const filePath = getConversationPath(conversationId);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }
  fs.unlinkSync(filePath);
  res.json({ success: true });
});

app.delete('/api/conversations/:conversationId/last-messages', (req, res) => {
  const { conversationId } = req.params;
  const conversation = loadConversation(conversationId);
  if (!conversation) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  if (conversation.messages.length < 2) {
    res.status(400).json({ error: 'Not enough messages to delete' });
    return;
  }

  conversation.messages.pop();
  conversation.messages.pop();
  saveConversation(conversation);
  res.json({ success: true, messages: conversation.messages });
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
    stream: true
  };
}

function streamJsonEvent(res, event) {
  const serialized = JSON.stringify(event);
  res.write(`${serialized}\n`);
}

function streamTextChunks(res, text, eventType) {
  if (!text) return Promise.resolve();
  const chunks = text.match(/.{1,50}/g) || [text];
  let index = 0;
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (index >= chunks.length) {
        clearInterval(interval);
        resolve();
        return;
      }
      streamJsonEvent(res, { type: eventType, text: chunks[index] });
      index += 1;
    }, 30);
  });
}

async function streamRemoteDeepseekResponse(requestBody, res) {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('Missing DEEPSEEK_API_KEY environment variable');
  }
  if (!DEEPSEEK_API_URL) {
    throw new Error('Missing DEEPSEEK_API_URL environment variable');
  }

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Deepseek API error ${response.status}: ${errorBody}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let reasoningContent = '';
  let answerContent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      if (line === 'data: [DONE]') continue;

      let data;
      try {
        if (line.startsWith('data: ')) {
          data = JSON.parse(line.slice(6));
        } else {
          data = JSON.parse(line);
        }
      } catch (e) {
        continue;
      }

      if (data.type === 'reasoning') {
        const text = data.delta || data.text || '';
        reasoningContent += text;
        await streamTextChunks(res, text, 'reasoning');
      } else if (data.type === 'message') {
        const text = data.delta?.content || data.content || '';
        answerContent += text;
        await streamTextChunks(res, text, 'answer');
      } else if (data.choices && data.choices.length > 0) {
        const choice = data.choices[0];
        if (choice.delta) {
          if (choice.delta.reasoning_content) {
            reasoningContent += choice.delta.reasoning_content;
            await streamTextChunks(res, choice.delta.reasoning_content, 'reasoning');
          }
          if (choice.delta.content) {
            answerContent += choice.delta.content;
            await streamTextChunks(res, choice.delta.content, 'answer');
          }
        }
      }
    }
  }

  if (buffer.trim()) {
    try {
      let data;
      if (buffer.startsWith('data: ')) {
        data = JSON.parse(buffer.slice(6));
      } else {
        data = JSON.parse(buffer);
      }
      if (data.choices && data.choices.length > 0) {
        const choice = data.choices[0];
        if (choice.delta?.reasoning_content) {
          reasoningContent += choice.delta.reasoning_content;
          await streamTextChunks(res, choice.delta.reasoning_content, 'reasoning');
        }
        if (choice.delta?.content) {
          answerContent += choice.delta.content;
          await streamTextChunks(res, choice.delta.content, 'answer');
        }
      }
    } catch (e) {
    }
  }

  return { reasoningContent, answerContent };
}

function simulateDeepseekStream(requestBody, res) {
  const historyCount = requestBody.messages.length;
  const thinkingSteps = [
    `收到历史消息 ${historyCount} 条，正在分析上下文...`,
    '正在检索相关知识...',
    '正在构建回答框架...',
    '正在优化回答内容...'
  ];
  const answer = '这是模拟的 Deepseek 响应。在实际使用中，这里会显示真实的 AI 回答。';

  return new Promise(async (resolve) => {
    for (const step of thinkingSteps) {
      await streamTextChunks(res, step + '\n\n', 'reasoning');
      await new Promise(r => setTimeout(r, 300));
    }
    await streamTextChunks(res, answer, 'answer');
    resolve(answer);
  });
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
      updatedAt: new Date().toISOString(),
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

  let reasoningContent = '';
  let answerContent = '';
  try {
    if (DEEPSEEK_API_URL && DEEPSEEK_API_KEY) {
      const result = await streamRemoteDeepseekResponse(requestBody, res);
      reasoningContent = result.reasoningContent;
      answerContent = result.answerContent;
    } else {
      answerContent = await simulateDeepseekStream(requestBody, res);
    }
  } catch (error) {
    res.write(`{"type":"error","message":"${error.message}"}`);
    res.end();
    return;
  }

  const assistantMessage = {
    role: 'assistant',
    reasoning: reasoningContent,
    content: answerContent,
    timestamp: new Date().toISOString()
  };
  appendMessage(conversation, assistantMessage);
});

app.listen(PORT, () => {
  console.log(`Deepseek page server started on http://localhost:${PORT}`);
});