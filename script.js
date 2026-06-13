// ── DOM refs ───────────────────────────────────────────────────────────────
var messagesEl        = document.getElementById('messages');
var emptyState        = document.getElementById('empty-state');
var userInput         = document.getElementById('user-input');
var sendBtn           = document.getElementById('send-btn');
var micBtn            = document.getElementById('mic-btn');
var clearBtn          = document.getElementById('clear-btn');
var screensaver       = document.getElementById('screensaver');
var screensaverVideo  = document.getElementById('screensaver-video');
var listeningOverlay  = document.getElementById('listening-overlay');
var listeningLabel    = document.getElementById('listening-label');
var orb               = document.getElementById('orb');
var bars              = document.querySelectorAll('.bar');

// ── Backend API (Cloudflare Tunnel) ────────────────────────────────────────
const API = ' https://featured-sapphire-built-shoot.trycloudflare.com';

// ── Conversation history ───────────────────────────────────────────────────
var conversationHistory = [];

// ── Idle screensaver ───────────────────────────────────────────────────────
var IDLE_MS = 40000;
var idleTimer = null;

function resetIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(showScreensaver, IDLE_MS);
}

function showScreensaver() {
  stopMic();
  screensaverVideo.currentTime = 0;
  screensaverVideo.play().catch(function () {
    screensaverVideo.muted = true;
    screensaverVideo.play();
  });
  screensaver.classList.remove('hidden');
}

function hideScreensaver() {
  screensaver.classList.add('hidden');
  screensaverVideo.pause();
  screensaverVideo.currentTime = 0;
  clearChat();
  resetIdle();
}

screensaver.addEventListener('contextmenu', function (e) {
  e.preventDefault();
  hideScreensaver();
});

['click', 'keydown', 'mousemove', 'touchstart'].forEach(function (ev) {
  document.addEventListener(ev, resetIdle, { passive: true });
});

resetIdle();

// ── Mic / Speech Recognition ───────────────────────────────────────────────
var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
var recognition = null;
var micActive = false;

function startMic() {
  if (!SpeechRecognition) {
    alert('Voice input is not supported in this browser. Please use Chrome or Edge.');
    return;
  }
  if (micActive) { stopMic(); return; }

  recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onstart = function () {
    micActive = true;
    micBtn.classList.add('mic-listening');
    listeningLabel.textContent = 'Listening';
    orb.classList.remove('orb-active');
    bars.forEach(function (b) { b.classList.remove('bar-active'); });
    listeningOverlay.classList.remove('hidden');
  };

  recognition.onresult = function (event) {
    var interim = '';
    var final = '';
    for (var i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        final += event.results[i][0].transcript;
      } else {
        interim += event.results[i][0].transcript;
      }
    }
    var text = final || interim;
    if (text.trim()) {
      orb.classList.add('orb-active');
      bars.forEach(function (b) { b.classList.add('bar-active'); });
    }
    if (final.trim()) {
      recognition.stop();
      submitFromMic(final.trim());
    }
  };

  recognition.onerror = function (e) {
    stopMic();
    if (e.error !== 'no-speech' && e.error !== 'aborted') {
      alert('Microphone error: ' + e.error + '. Please allow microphone access.');
    }
  };

  recognition.onend = function () {
    micActive = false;
    micBtn.classList.remove('mic-listening');
    listeningOverlay.classList.add('hidden');
  };

  recognition.start();
}

function stopMic() {
  if (recognition) {
    try { recognition.abort(); } catch (e) {}
    recognition = null;
  }
  micActive = false;
  micBtn.classList.remove('mic-listening');
  listeningOverlay.classList.add('hidden');
}

function submitFromMic(text) {
  setTimeout(function () {
    listeningOverlay.classList.add('hidden');
    sendMessage(text);
  }, 400);
}

micBtn.addEventListener('click', function () {
  if (busy) return;
  startMic();
});

// ── Chat helpers ───────────────────────────────────────────────────────────
function clearChat() {
  conversationHistory = [];
  messagesEl.querySelectorAll('.msg-row').forEach(function (r) { r.remove(); });
  emptyState.style.display = '';
  clearBtn.classList.add('hidden');
}

function scrollBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function typewrite(el, text, speed) {
  speed = speed || 12;
  return new Promise(function (resolve) {
    var i = 0;
    var tick = setInterval(function () {
      el.textContent += text[i];
      i++;
      scrollBottom();
      if (i >= text.length) { clearInterval(tick); resolve(); }
    }, speed);
  });
}

function addUserMessage(text) {
  emptyState.style.display = 'none';
  clearBtn.classList.remove('hidden');

  var row = document.createElement('div');
  row.className = 'msg-row row-user';

  var sender = document.createElement('div');
  sender.className = 'msg-sender';
  sender.textContent = 'User';

  var bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = text;

  row.appendChild(sender);
  row.appendChild(bubble);
  messagesEl.appendChild(row);
  scrollBottom();
}

function addThinking() {
  var row = document.createElement('div');
  row.className = 'msg-row row-aura';

  var sender = document.createElement('div');
  sender.className = 'msg-sender';
  sender.textContent = 'Aura';

  var auraRow = document.createElement('div');
  auraRow.className = 'aura-row';

  var avatar = document.createElement('div');
  avatar.className = 'aura-avatar';
  avatar.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C61F3A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';

  var bubble = document.createElement('div');
  bubble.className = 'thinking-bubble';
  bubble.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';

  auraRow.appendChild(avatar);
  auraRow.appendChild(bubble);
  row.appendChild(sender);
  row.appendChild(auraRow);
  messagesEl.appendChild(row);
  scrollBottom();
  return row;
}

async function addAuraMessage(text) {
  var row = document.createElement('div');
  row.className = 'msg-row row-aura';

  var sender = document.createElement('div');
  sender.className = 'msg-sender';
  sender.textContent = 'Aura';

  var auraRow = document.createElement('div');
  auraRow.className = 'aura-row';

  var avatar = document.createElement('div');
  avatar.className = 'aura-avatar';
  avatar.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C61F3A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';

  var bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  auraRow.appendChild(avatar);
  auraRow.appendChild(bubble);
  row.appendChild(sender);
  row.appendChild(auraRow);
  messagesEl.appendChild(row);
  scrollBottom();

  await typewrite(bubble, text, 12);
}

// ── Backend API call (streaming) ───────────────────────────────────────────
async function callBackend(userText, bubbleEl) {
  var historyToSend = conversationHistory.slice();
  conversationHistory.push({ role: 'user', content: userText });

  var res = await fetch(API + '/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: userText,
      history: historyToSend,
      model: 'claude-haiku-4-5-20251001' // adjust to whatever your backend expects
    })
  });

  if (!res.ok) {
    throw new Error('Server error ' + res.status);
  }

  var reader = res.body.getReader();
  var decoder = new TextDecoder();
  var full = '';

  while (true) {
    var chunk = await reader.read();
    if (chunk.done) break;
    full += decoder.decode(chunk.value, { stream: true });
    bubbleEl.textContent = full;
    scrollBottom();
  }

  conversationHistory.push({ role: 'assistant', content: full });
  return full;
}

// ── Send logic ─────────────────────────────────────────────────────────────
var busy = false;

function setLocked(locked) {
  busy = locked;
  sendBtn.disabled = locked;
  micBtn.disabled = locked;
  userInput.disabled = locked;
}

async function sendMessage(text) {
  text = (text || '').trim();
  if (!text || busy) return;

  setLocked(true);
  userInput.value = '';

  addUserMessage(text);
  var thinkEl = addThinking();

  try {
    // Replace the "thinking" bubble with a live-updating bubble for streaming
    var auraRow = thinkEl.querySelector('.aura-row');
    var thinkingBubble = auraRow.querySelector('.thinking-bubble');
    var liveBubble = document.createElement('div');
    liveBubble.className = 'msg-bubble';
    thinkingBubble.replaceWith(liveBubble);

    await callBackend(text, liveBubble);
  } catch (err) {
    var auraRow2 = thinkEl.querySelector('.aura-row');
    var existingBubble = auraRow2.querySelector('.msg-bubble, .thinking-bubble');
    if (existingBubble) existingBubble.remove();
    var errBubble = document.createElement('div');
    errBubble.className = 'msg-bubble';
    auraRow2.appendChild(errBubble);
    await typewrite(errBubble, 'Sorry, I could not connect right now. Please try again or speak to the reception desk. (' + err.message + ')', 12);
  }

  setLocked(false);
  userInput.focus();
}

// ── Event bindings ─────────────────────────────────────────────────────────
sendBtn.addEventListener('click', function () { sendMessage(userInput.value); });
userInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') sendMessage(userInput.value);
});
clearBtn.addEventListener('click', clearChat);