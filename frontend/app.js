const conversationSelect = document.getElementById('conversation-select');
const newConversationButton = document.getElementById('new-conversation');
const conversationWindow = document.getElementById('conversation-window');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const requestStatus = document.getElementById('request-status');

let currentConversationId = null;
let conversations = [];

function setStatus(text) {
  requestStatus.textContent = text;
}

function createConversationOption(id) {
  const option = document.createElement('option');
  option.value = id;
  option.textContent = id;
  return option;
}

function renderConversationList() {
  conversationSelect.innerHTML = '';
  conversations.forEach((id) => {
    conversationSelect.appendChild(createConversationOption(id));
  });
}

function renderMessages(messages) {
  conversationWindow.innerHTML = '';
  messages.forEach((message) => {
    const item = document.createElement('div');
    item.className = `message ${message.role}`;
    item.textContent = message.content;
    conversationWindow.appendChild(item);
  });
  conversationWindow.scrollTop = conversationWindow.scrollHeight;
}

async function loadConversationList() {
  try {
    const res = await fetch('/api/conversations');
    const data = await res.json();
    conversations = data.conversations;
    renderConversationList();
    if (conversations.length > 0) {
      currentConversationId = conversations[0];
      conversationSelect.value = currentConversationId;
      await loadConversationHistory(currentConversationId);
    }
  } catch (error) {
    console.error(error);
    setStatus('无法加载对话列表');
  }
}

async function loadConversationHistory(conversationId) {
  try {
    const res = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}`);
    const data = await res.json();
    renderMessages(data.messages || []);
    currentConversationId = conversationId;
  } catch (error) {
    console.error(error);
    setStatus('无法加载对话历史');
  }
}

async function createNewConversation() {
  try {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();
    conversations.unshift(data.conversationId);
    renderConversationList();
    conversationSelect.value = data.conversationId;
    await loadConversationHistory(data.conversationId);
  } catch (error) {
    console.error(error);
    setStatus('无法创建新对话');
  }
}

async function sendMessage() {
  const content = messageInput.value.trim();
  if (!content || !currentConversationId) return;
  setStatus('正在发送');
  sendButton.disabled = true;

  const userMessage = {
    role: 'user',
    content,
    timestamp: new Date().toISOString()
  };
  renderMessages([...document.querySelectorAll('.message')].map((item) => ({ role: item.classList.contains('user') ? 'user' : 'assistant', content: item.textContent })));
  conversationWindow.appendChild(Object.assign(document.createElement('div'), { className: 'message user', textContent: userMessage.content }));
  conversationWindow.scrollTop = conversationWindow.scrollHeight;
  messageInput.value = '';

  const responseField = document.createElement('div');
  responseField.className = 'message assistant';
  responseField.textContent = '';
  conversationWindow.appendChild(responseField);
  conversationWindow.scrollTop = conversationWindow.scrollHeight;

  try {
    const response = await fetch(`/api/conversations/${encodeURIComponent(currentConversationId)}/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userMessage })
    });

    if (!response.ok) {
      throw new Error('请求失败');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let done = false;
    setStatus('接收中');

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        responseField.textContent += decoder.decode(value);
        conversationWindow.scrollTop = conversationWindow.scrollHeight;
      }
    }

    setStatus('完成');
  } catch (error) {
    console.error(error);
    responseField.textContent = '请求出错，请稍后重试。';
    setStatus('请求失败');
  } finally {
    sendButton.disabled = false;
  }
}

conversationSelect.addEventListener('change', async () => {
  if (conversationSelect.value) {
    await loadConversationHistory(conversationSelect.value);
  }
});

newConversationButton.addEventListener('click', createNewConversation);
sendButton.addEventListener('click', sendMessage);

loadConversationList();
