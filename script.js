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

// ── Backend API (main server: /chat, /transcribe) ───────────────────────────
const API = 'https://flower-stocks-drinks-lyrics.trycloudflare.com'; // update with current tunnel URL

// ── Conversation history ───────────────────────────────────────────────────
var conversationHistory = [];

// ── Physical button trigger (via SocketIO from Pi GPIO) ─────────────────────
var socket = io();

socket.on('mic_trigger', function () {
  if (busy) return;
  if (!screensaver.classList.contains('hidden')) {
    hideScreensaver();
  }
  startMic();
});

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

['click', 'keydown', 'mousemove', 'touchstart'].forEach(function (ev) {
  document.addEventListener(ev, resetIdle, { passive: true });
});

resetIdle();

// ── Mic / Recording (AI4Bharat STT via /transcribe) ─────────────────────────
var mediaRecorder = null;
var audioChunks = [];
var micActive = false;

function startMic() {
  if (micActive) { stopMic(); return; }

  navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
    micActive = true;
    micBtn.classList.add('mic-listening');
    listeningLabel.textContent = 'Listening';
    orb.classList.remove('orb-active');
    bars.forEach(function (b) { b.classList.remove('bar-active'); });
    listeningOverlay.classList.remove('hidden');

    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = function (e) {
      audioChunks.push(e.data);
    };

    mediaRecorder.onstop = function () {
      stream.getTracks().forEach(function (t) { t.stop(); });
      var audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      transcribeAudio(audioBlob);
    };

    mediaRecorder.start();

    orb.classList.add('orb-active');
    bars.forEach(function (b) { b.classList.add('bar-active'); });

    // auto-stop after 8s
    setTimeout(function () {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }
    }, 8000);

  }).catch(function (err) {
    alert('Microphone access denied: ' + err.message);
  });
}

function stopMic() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
  micActive = false;
  micBtn.classList.remove('mic-listening');
  listeningOverlay.classList.add('hidden');
}

async function transcribeAudio(blob) {
  listeningLabel.textContent = 'Transcribing...';

  var formData = new FormData();
  formData.append('audio', blob, 'recording.webm');
  formData.append('language', 'ne'); // 'ne' for Nepali, 'en' for English, 'hi' for Hindi

  try {
    var res = await fetch(API + '/transcribe', {
      method: 'POST',
      body: formData
    });
    if (!res.ok) throw new Error('Transcription failed (' + res.status + ')');
    var data = await res.json();

    micActive = false;
    micBtn.classList.remove('mic-listening');
    listeningOverlay.classList.add('hidden');

    if (data.text && data.text.trim()) {
      sendMessage(data.text.trim());
    }
  } catch (err) {
    micActive = false;
    micBtn.classList.remove('mic-listening');
    listeningOverlay.classList.add('hidden');
    alert('Transcription error: ' + err.message);
  }
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

// ── Backend /chat call (streaming text/plain with __METADATA__ prefix) ─────
async function callBackend(userText, bubbleEl) {
  var historyToSend = conversationHistory.slice();
  conversationHistory.push({ role: 'user', content: userText });

  var res = await fetch(API + '/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: userText,
      history: historyToSend,
      model: 'gemma4:e2b'
    })
  });

  if (!res.ok) {
    throw new Error('Server error ' + res.status);
  }

  var reader = res.body.getReader();
  var decoder = new TextDecoder();
  var full = '';
  var metadataStripped = false;
  var buffer = '';

  while (true) {
    var chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });

    if (!metadataStripped) {
      var nlIndex = buffer.indexOf('\n');
      if (nlIndex === -1) continue; // wait for full metadata line
      buffer = buffer.slice(nlIndex + 1);
      metadataStripped = true;
    }

    full += buffer;
    buffer = '';
    bubbleEl.textContent = full;
    scrollBottom();
  }

  conversationHistory.push({ role: 'assistant', content: full });
  return full;
}

// ── TTS playback via Pi's local Piper (/synthesize-raw, same origin) ───────
async function speak(text) {
  try {
    var formData = new FormData();
    formData.append('text', text);

    resetIdle();

    var res = await fetch('/synthesize-raw', {
      method: 'POST',
      body: formData
    });
    if (!res.ok) return;

    var blob = await res.blob();
    var audio = new Audio(URL.createObjectURL(blob));

    audio.onplay = function () { resetIdle(); };
    audio.onended = function () { resetIdle(); };

    audio.play().catch(function () {});
  } catch (e) {
    console.error('TTS error:', e);
  }
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
    var auraRow = thinkEl.querySelector('.aura-row');
    var thinkingBubble = auraRow.querySelector('.thinking-bubble');
    var liveBubble = document.createElement('div');
    liveBubble.className = 'msg-bubble';
    thinkingBubble.replaceWith(liveBubble);

    var reply = await callBackend(text, liveBubble);
    speak(reply); // play TTS audio after full response

  } catch (err) {
    var auraRow2 = thinkEl.querySelector('.aura-row');
    var existingBubble = auraRow2.querySelector('.msg-bubble, .thinking-bubble');
    if (existingBubble) existingBubble.remove();
    var errBubble = document.createElement('div');
    errBubble.className = 'msg-bubble';
    errBubble.textContent = 'Sorry, I could not connect right now. Please try again or speak to the reception desk. (' + err.message + ')';
    auraRow2.appendChild(errBubble);
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
