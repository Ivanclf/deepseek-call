const conversationList = document.getElementById('conversation-list');
const conversationTitle = document.getElementById('conversation-title');
const chatSubtitle = document.getElementById('chat-subtitle');
const conversationWindow = document.getElementById('conversation-window');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const clearInputButton = document.getElementById('clear-input');
const cancelEditButton = document.getElementById('cancel-edit');
const inputInfo = document.getElementById('input-info');
const requestStatus = document.getElementById('request-status');
const newConversationButton = document.getElementById('new-conversation');
const themeToggle = document.getElementById('theme-toggle');
const emptyState = document.getElementById('empty-state');

let currentConversationId = null;
let conversations = [];
let isEditMode = false;
let lastUserMessage = null;
let lastAssistantMessage = null;

function setStatus(text, type = 'success') {
  const statusText = requestStatus.querySelector('span:last-child');
  statusText.textContent = text;
  requestStatus.className = `status-chip ${type}`;
  Animations.pulseStatus(requestStatus);
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } else if (days === 1) {
    return '昨天';
  } else if (days < 7) {
    return `${days}天前`;
  } else {
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  }
}

function createConversationItem(conv) {
  const item = document.createElement('div');
  item.className = 'conversation-item';
  item.dataset.conversationId = conv.id;

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = conv.id.charAt(0).toUpperCase();

  const content = document.createElement('div');
  content.className = 'content';

  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = conv.lastMessage || `会话 ${conv.id.slice(-8)}`;

  const date = document.createElement('div');
  date.className = 'date';
  date.textContent = formatDate(conv.timestamp);

  content.appendChild(title);
  content.appendChild(date);

  const trash = document.createElement('div');
  trash.className = 'trash';
  trash.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>';
  trash.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteConversation(conv.id);
  });

  item.appendChild(avatar);
  item.appendChild(content);
  item.appendChild(trash);

  item.addEventListener('click', async () => {
    await loadConversationHistory(conv.id);
  });

  return item;
}

function renderConversationList() {
  conversationList.innerHTML = '';
  if (conversations.length === 0) {
    const emptyItem = document.createElement('div');
    emptyItem.className = 'conversation-item empty';
    emptyItem.textContent = '暂无会话';
    conversationList.appendChild(emptyItem);
    return;
  }

  conversations.forEach((conv) => {
    const item = createConversationItem(conv);
    if (conv.id === currentConversationId) {
      item.classList.add('active');
    }
    conversationList.appendChild(item);
  });
}

function setActiveConversation(id) {
  currentConversationId = id;
  conversationTitle.textContent = 'Deepseek';
  chatSubtitle.textContent = '历史对话已加载，继续问 Deepseek 问题。';
  renderConversationList();
}

function showEmptyState(show) {
  emptyState.style.display = show ? 'flex' : 'none';
}

function scrollToBottom() {
  conversationWindow.scrollTo({
    top: conversationWindow.scrollHeight,
    behavior: 'smooth'
  });
}

function showInputInfo() {
  inputInfo.classList.add('visible');
  cancelEditButton.style.display = 'inline-flex';
}

function hideInputInfo() {
  inputInfo.classList.remove('visible');
  cancelEditButton.style.display = 'none';
  isEditMode = false;
  lastUserMessage = null;
  lastAssistantMessage = null;
}

function enterEditMode() {
  if (!lastUserMessage || conversations.length === 0) return;
  isEditMode = true;
  messageInput.value = lastUserMessage.content;
  messageInput.focus();
  showInputInfo();
}

function cancelEdit() {
  hideInputInfo();
  messageInput.value = '';
  loadConversation(currentConversationId);
}

function renderMarkdown(text) {
  if (typeof marked !== 'undefined') {
    marked.setOptions({
      breaks: true,
      gfm: true
    });
    return marked.parse(text);
  }
  return text.replace(/\n/g, '<br>');
}

function addMessageBubble(message) {
  const item = document.createElement('div');
  item.className = `message ${message.role}`;

  const header = document.createElement('div');
  header.className = 'message-header';

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = message.role === 'user' ? 'U' : 'D';

  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = message.role === 'user' ? '你' : 'Deepseek';

  const time = document.createElement('span');
  time.className = 'time';
  time.textContent = message.timestamp ? formatDate(message.timestamp) : new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  header.appendChild(avatar);
  header.appendChild(name);
  header.appendChild(time);

  const content = document.createElement('div');
  content.className = 'message-content markdown-body';
  if (message.role === 'assistant') {
    content.innerHTML = renderMarkdown(message.content);
  } else {
    content.textContent = message.content;
  }

  item.appendChild(header);

  if (message.role === 'assistant' && message.reasoning) {
    const reasoningEl = document.createElement('div');
    reasoningEl.className = 'message-reasoning';
    reasoningEl.textContent = message.reasoning;
    item.appendChild(reasoningEl);
  }

  item.appendChild(content);

  conversationWindow.appendChild(item);
  Animations.fadeIn(item);
  scrollToBottom();
}

function renderMessages(messages) {
  showEmptyState(false);
  conversationWindow.innerHTML = '';
  lastUserMessage = null;
  lastAssistantMessage = null;

  messages.forEach((msg, index) => {
    addMessageBubble(msg);
    if (msg.role === 'user') {
      lastUserMessage = msg;
    } else if (msg.role === 'assistant') {
      lastAssistantMessage = msg;
    }
  });

  scrollToBottom();
}

async function fetchConversationList() {
  const res = await fetch('/api/conversations');
  const data = await res.json();
  return data.conversations || [];
}

async function fetchConversationHistory(conversationId) {
  const res = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '加载失败');
  }
  return data.messages || [];
}

async function createConversation() {
  const res = await fetch('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  const data = await res.json();
  return data.conversationId;
}

async function removeConversation(conversationId) {
  const res = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    throw new Error('删除失败');
  }
}

async function streamMessage(conversationId, message) {
  const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  });
  if (!response.ok) {
    throw new Error('请求失败');
  }
  return response.body.getReader();
}

async function loadConversationList() {
  try {
    conversations = await fetchConversationList();
    if (conversations.length > 0) {
      await loadConversationHistory(conversations[0].id);
    } else {
      showEmptyState(true);
      conversationTitle.textContent = 'Deepseek';
      chatSubtitle.textContent = '创建新会话开始与 AI 助手对话';
    }
  } catch (error) {
    console.error(error);
    setStatus('无法加载对话列表', 'error');
  }
}

async function loadConversationHistory(conversationId) {
  try {
    const messages = await fetchConversationHistory(conversationId);
    setActiveConversation(conversationId);
    renderMessages(messages);

    if (messages.length > 0) {
      showInputInfo();
    } else {
      hideInputInfo();
    }

    setStatus('已加载对话历史');
  } catch (error) {
    console.error(error);
    setStatus('无法加载对话历史', 'error');
  }
}

async function createNewConversation() {
  try {
    const conversationId = await createConversation();
    conversations.unshift({
      id: conversationId,
      lastMessage: '',
      timestamp: new Date().toISOString()
    });
    await loadConversationHistory(conversationId);
    showEmptyState(false);
    hideInputInfo();
  } catch (error) {
    console.error(error);
    setStatus('无法创建新会话', 'error');
  }
}

async function deleteConversation(conversationId) {
  try {
    await removeConversation(conversationId);
    conversations = conversations.filter(c => c.id !== conversationId);
    if (currentConversationId === conversationId) {
      currentConversationId = null;
      showEmptyState(true);
      conversationTitle.textContent = 'Deepseek';
      chatSubtitle.textContent = '创建新会话开始与 AI 助手对话';
    }
    renderConversationList();
    setStatus('会话已删除');
  } catch (error) {
    console.error(error);
    setStatus('无法删除会话', 'error');
  }
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('deepseek-theme', newTheme);

  const icon = themeToggle.querySelector('svg');
  if (newTheme === 'dark') {
    icon.innerHTML = '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>';
  } else {
    icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  }
}

function initTheme() {
  const savedTheme = localStorage.getItem('deepseek-theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  const icon = themeToggle.querySelector('svg');
  if (savedTheme === 'dark') {
    icon.innerHTML = '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>';
  }
}

async function sendMessage() {
  const content = messageInput.value.trim();
  if (!content || !currentConversationId) return;

  if (isEditMode && lastUserMessage) {
    await deleteLastMessages();
  }

  isEditMode = false;
  hideInputInfo();

  setStatus('正在发送', 'thinking');
  sendButton.disabled = true;

  const userMessage = {
    role: 'user',
    content,
    timestamp: new Date().toISOString()
  };

  addMessageBubble(userMessage);
  lastUserMessage = userMessage;
  lastAssistantMessage = null;
  messageInput.value = '';
  showInputInfo();

  let assistantBubble = null;
  let reasoningContentEl = null;
  let answerContentEl = null;
  let fullAnswerText = '';
  let streamBuffer = '';

  function createAssistantBubble() {
    assistantBubble = document.createElement('div');
    assistantBubble.className = 'message assistant';

    const header = document.createElement('div');
    header.className = 'message-header';

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = 'D';

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = 'Deepseek';

    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

    header.appendChild(avatar);
    header.appendChild(name);
    header.appendChild(time);

    reasoningContentEl = document.createElement('div');
    reasoningContentEl.className = 'message-reasoning';

    answerContentEl = document.createElement('div');
    answerContentEl.className = 'message-content markdown-body';

    assistantBubble.appendChild(header);
    assistantBubble.appendChild(reasoningContentEl);
    assistantBubble.appendChild(answerContentEl);
    conversationWindow.appendChild(assistantBubble);
    Animations.fadeIn(assistantBubble);
  }

  function appendReasoningText(text) {
    if (!assistantBubble) {
      createAssistantBubble();
    }
    reasoningContentEl.textContent += text;
    scrollToBottom();
  }

  function appendAnswerText(text) {
    if (!assistantBubble) {
      createAssistantBubble();
    }
    fullAnswerText += text;
    answerContentEl.textContent = fullAnswerText;
    try {
      answerContentEl.innerHTML = renderMarkdown(fullAnswerText);
    } catch (e) {
      answerContentEl.textContent = fullAnswerText;
    }
    scrollToBottom();
  }

  try {
    const reader = await streamMessage(currentConversationId, userMessage);
    const decoder = new TextDecoder();
    let done = false;
    setStatus('思考中...', 'thinking');

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        streamBuffer += decoder.decode(value, { stream: true });
        const lines = streamBuffer.split('\n');
        streamBuffer = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === 'reasoning') {
              appendReasoningText(event.text);
            } else if (event.type === 'answer') {
              appendAnswerText(event.text);
            }
          } catch (error) {
            console.error('解析流事件失败', error, line);
          }
        }
      }
    }

    if (streamBuffer.trim()) {
      try {
        const event = JSON.parse(streamBuffer);
        if (event.type === 'reasoning') {
          appendReasoningText(event.text);
        } else if (event.type === 'answer') {
          appendAnswerText(event.text);
        }
      } catch (error) {
        console.error('解析剩余流事件失败', error, streamBuffer);
      }
    }

    setStatus('完成');
    scrollToBottom();

    const convIndex = conversations.findIndex(c => c.id === currentConversationId);
    if (convIndex !== -1) {
      conversations[convIndex].lastMessage = content.substring(0, 50) + (content.length > 50 ? '...' : '');
      conversations[convIndex].timestamp = new Date().toISOString();
      renderConversationList();
    }
  } catch (error) {
    console.error(error);
    if (!assistantBubble) {
      createAssistantBubble();
    }
    answerContentEl.innerHTML = renderMarkdown('请求出错，请稍后重试。');
    scrollToBottom();
    setStatus('请求失败', 'error');
  } finally {
    sendButton.disabled = false;
  }
}

newConversationButton.addEventListener('click', createNewConversation);
clearInputButton.addEventListener('click', () => {
  messageInput.value = '';
  setStatus('输入已清空');
});
sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});
themeToggle.addEventListener('click', toggleTheme);
cancelEditButton.addEventListener('click', cancelEdit);
document.getElementById('modify-btn').addEventListener('click', enterEditMode);

async function deleteLastMessages() {
  if (!currentConversationId) return;
  try {
    const res = await fetch(`/api/conversations/${currentConversationId}/last-messages`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('删除失败');
    lastUserMessage = null;
    lastAssistantMessage = null;

    const data = await res.json();
    conversationWindow.innerHTML = '';
    data.messages.forEach(addMessageBubble);
    scrollToBottom();

    setStatus('已删除上一轮对话');
  } catch (error) {
    console.error(error);
    setStatus('删除失败', 'error');
  }
}

initTheme();
loadConversationList();