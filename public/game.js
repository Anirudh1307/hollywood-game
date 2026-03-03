const socket = io();
const roomId = window.location.pathname.split('/')[2];
let gameState = null;
let mySocketId = null;
let chatMessages = [];

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function addChatMessage(msg) {
  chatMessages.push(msg);
  renderAllChats();
}

function renderAllChats() {
  renderChat();
  renderHostChat();
  renderWaitingChat();
}

socket.on('connect', () => {
  mySocketId = socket.id;
});

document.getElementById('roomId').textContent = roomId;
socket.emit('join-room', roomId);

socket.on('need-name', (need) => {
  if (need) {
    document.getElementById('nameSetup').style.display = 'block';
  }
});

socket.on('chatHistory', (history) => {
  chatMessages = history;
  renderAllChats();
});

socket.on('chatUpdate', (msg) => {
  addChatMessage(msg);
});

socket.on('kicked', () => {
  alert('You have been kicked from the room');
  window.location.href = '/';
});

socket.on('game-state', (state) => {
  gameState = state;
  document.getElementById('nameSetup').style.display = 'none';
  
  const isHost = gameState.hostSocketId === mySocketId;
  
  if (gameState.roomState === 'waiting_for_players') {
    document.getElementById('hostSetup').style.display = 'none';
    document.getElementById('waitingArea').style.display = 'block';
    document.getElementById('gameArea').style.display = 'none';
    document.getElementById('waitingMessage').style.display = 'block';
    document.getElementById('hostWaitingText').style.display = 'none';
    renderWaitingChat();
  } else if (gameState.roomState === 'waiting_for_host_input') {
    if (isHost) {
      document.getElementById('hostSetup').style.display = 'block';
      document.getElementById('waitingArea').style.display = 'none';
      document.getElementById('gameArea').style.display = 'none';
      document.getElementById('hostSecretWord').style.display = 'none';
      renderHostChat();
    } else {
      document.getElementById('hostSetup').style.display = 'none';
      document.getElementById('waitingArea').style.display = 'block';
      document.getElementById('gameArea').style.display = 'none';
      document.getElementById('waitingMessage').style.display = 'none';
      document.getElementById('hostWaitingText').style.display = 'block';
      const hostName = gameState.players[gameState.hostIndex].username;
      document.getElementById('currentHostName').textContent = hostName;
      renderWaitingChat();
    }
  } else {
    document.getElementById('hostSetup').style.display = 'none';
    document.getElementById('waitingArea').style.display = 'none';
    document.getElementById('gameArea').style.display = 'block';
    document.getElementById('waitingMessage').style.display = 'none';
    renderGame();
  }
});

function renderGame() {
  if (!gameState) return;
  renderHollywood();
  renderWord();
  renderClues();
  renderKeypad();
  renderHistory();
  renderGameOver();
  renderScoreboard();
  renderTurnIndicator();
  renderChat();
}

function renderTurnIndicator() {
  const indicator = document.getElementById('turnIndicator');
  if (!indicator) return;
  
  const isHost = gameState.hostSocketId === mySocketId;
  const isMyTurn = gameState.turnSocketId === mySocketId;
  
  if (isHost) {
    indicator.innerHTML = '<div class="turn-msg host-msg">You are the host - Players are guessing</div>';
  } else if (isMyTurn) {
    indicator.innerHTML = '<div class="turn-msg my-turn">🎯 YOUR TURN TO GUESS!</div>';
  } else {
    const turnPlayer = gameState.players[gameState.turnIndex];
    indicator.innerHTML = `<div class="turn-msg waiting-turn">Waiting for ${turnPlayer?.username}'s turn...</div>`;
  }
}

function renderHollywood() {
  const hollywood = 'HOLLYWOOD';
  const display = document.getElementById('hollywoodDisplay');
  display.innerHTML = '';
  
  for (let i = 0; i < hollywood.length; i++) {
    const span = document.createElement('span');
    span.className = 'hollywood-letter';
    span.textContent = i < gameState.hollywoodIndex ? 'X' : hollywood[i];
    if (i < gameState.hollywoodIndex) {
      span.classList.add('struck');
    }
    display.appendChild(span);
  }
}

function renderWord() {
  const display = document.getElementById('wordDisplay');
  display.innerHTML = gameState.revealed.map(letter => 
    `<span class="word-letter">${letter}</span>`
  ).join('');
}

function renderClues() {
  const section = document.getElementById('cluesSection');
  if (gameState.clues.length === 0) {
    section.innerHTML = '';
    return;
  }
  
  section.innerHTML = '<h4>Clues:</h4>' + 
    gameState.clues.map(clue => `<div class="clue">• ${clue}</div>`).join('');
}

function renderKeypad() {
  const keypad = document.getElementById('keypad');
  keypad.innerHTML = '';
  
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const isHost = gameState.hostSocketId === mySocketId;
  const isMyTurn = gameState.turnSocketId === mySocketId;
  
  for (const letter of alphabet) {
    const button = document.createElement('button');
    button.className = 'key';
    button.textContent = letter;
    
    const used = gameState.correctLetters.includes(letter) || 
                  gameState.wrongLetters.includes(letter);
    
    if (used || gameState.gameOver || isHost || !isMyTurn || gameState.roomState !== 'round_active') {
      button.disabled = true;
      if (used) button.classList.add('used');
    }
    
    button.addEventListener('click', () => {
      socket.emit('guess-letter', { roomId, letter });
    });
    
    keypad.appendChild(button);
  }
}

function renderHistory() {
  document.getElementById('wrongLetters').textContent = 
    gameState.wrongLetters.join(', ') || 'None';
  
  document.getElementById('wrongWords').textContent = 
    gameState.wrongWords.join(', ') || 'None';
}

function renderGameOver() {
  const message = document.getElementById('gameOverMessage');
  const input = document.getElementById('wordGuessInput');
  const button = document.getElementById('guessWordBtn');
  
  const isHost = gameState.hostSocketId === mySocketId;
  const isMyTurn = gameState.turnSocketId === mySocketId;
  
  if (isHost || !isMyTurn || gameState.roomState !== 'round_active') {
    input.disabled = true;
    button.disabled = true;
  } else {
    input.disabled = false;
    button.disabled = false;
  }
  
  if (gameState.gameOver) {
    message.style.display = 'flex';
    message.className = gameState.winner ? 'game-over-overlay win' : 'game-over-overlay lose';
    
    const guesserName = gameState.players[gameState.turnIndex]?.username || 'Someone';
    const hostName = gameState.players[gameState.hostIndex]?.username || 'Host';
    
    if (gameState.winner) {
      message.innerHTML = `
        <div class="overlay-content">
          <h2>🎉 CORRECT! 🎉</h2>
          <p>${guesserName} guessed the word!</p>
          <p class="word-reveal">${gameState.word}</p>
          <p>Next round starting...</p>
        </div>
      `;
    } else {
      message.innerHTML = `
        <div class="overlay-content">
          <h2>💀 ROUND FAILED 💀</h2>
          <p>The word was:</p>
          <p class="word-reveal">${gameState.word}</p>
          <p>Next round starting...</p>
        </div>
      `;
    }
  } else {
    message.style.display = 'none';
  }
}

function renderScoreboard() {
  const scoreboard = document.getElementById('scoreboard');
  if (!scoreboard) return;
  
  const hostName = gameState.players[gameState.hostIndex]?.username || 'Host';
  let html = `<h4>Round ${gameState.round} - Current Host: ${hostName}</h4>`;
  
  gameState.sortedPlayers.forEach(player => {
    const isCurrentHost = player.socketId === gameState.hostSocketId;
    const isMasterHost = gameState.masterHostIndex === gameState.players.indexOf(player);
    const prefix = isCurrentHost ? '👑 ' : (isMasterHost ? '⭐ ' : '');
    const suffix = player.socketId === mySocketId ? ' (You)' : '';
    const kickBtn = isMasterHost && player.socketId !== mySocketId ? 
      ` <button class="kick-btn" onclick="kickPlayer('${player.socketId}')">Kick</button>` : '';
    html += `<div class="player-row">${prefix}${player.username}${suffix}: ${gameState.scores[player.socketId] || 0}${kickBtn}</div>`;
  });
  
  scoreboard.innerHTML = html;
}

function renderChat() {
  const container = document.getElementById('chatMessages');
  if (!container) return;
  
  container.innerHTML = chatMessages.map(msg => 
    `<div class="chat-msg"><strong>${escapeHtml(msg.sender)}:</strong> ${escapeHtml(msg.message)}</div>`
  ).join('');
  container.scrollTop = container.scrollHeight;
}

function renderHostChat() {
  const container = document.getElementById('hostChatMessages');
  if (!container) return;
  
  container.innerHTML = chatMessages.map(msg => 
    `<div class="chat-msg"><strong>${escapeHtml(msg.sender)}:</strong> ${escapeHtml(msg.message)}</div>`
  ).join('');
  container.scrollTop = container.scrollHeight;
}

function renderWaitingChat() {
  const container = document.getElementById('waitingChatMessages');
  if (!container) return;
  
  container.innerHTML = chatMessages.map(msg => 
    `<div class="chat-msg"><strong>${escapeHtml(msg.sender)}:</strong> ${escapeHtml(msg.message)}</div>`
  ).join('');
  container.scrollTop = container.scrollHeight;
}

function kickPlayer(targetSocketId) {
  socket.emit('kick-player', { roomId, targetSocketId });
}

document.getElementById('submitNameBtn').addEventListener('click', () => {
  const name = document.getElementById('nameInput').value.trim();
  if (!name) {
    alert('Please enter your name');
    return;
  }
  socket.emit('set-name', { roomId, name });
});

document.getElementById('nameInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('submitNameBtn').click();
  }
});

document.getElementById('copyLinkBtn').addEventListener('click', () => {
  const url = window.location.href;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      alert('Link copied!');
    }).catch(() => {
      prompt('Copy this link:', url);
    });
  } else {
    prompt('Copy this link:', url);
  }
});

document.getElementById('startGameBtn').addEventListener('click', () => {
  const word = document.getElementById('wordInput').value.trim();
  if (!word) {
    alert('Please enter a word');
    return;
  }
  
  const clues = [
    document.getElementById('clue1').value,
    document.getElementById('clue2').value,
    document.getElementById('clue3').value
  ];
  
  socket.emit('start-game', { roomId, word, clues });
});

document.getElementById('skipRoundBtn').addEventListener('click', () => {
  socket.emit('skip-round', roomId);
});

document.getElementById('guessWordBtn').addEventListener('click', () => {
  const word = document.getElementById('wordGuessInput').value.trim();
  if (word) {
    socket.emit('guess-word', { roomId, word });
    document.getElementById('wordGuessInput').value = '';
  }
});

document.getElementById('wordGuessInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('guessWordBtn').click();
  }
});

document.getElementById('sendChatBtn').addEventListener('click', () => {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (message && message.length > 0 && message.length <= 200) {
    socket.emit('chatMessage', { roomId, message });
    input.value = '';
  }
});

document.getElementById('chatInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('sendChatBtn').click();
  }
});

document.getElementById('hostChatInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('hostSendChatBtn').click();
  }
});

document.getElementById('waitingChatInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('waitingSendChatBtn').click();
  }
});

document.getElementById('hostSendChatBtn').addEventListener('click', () => {
  const input = document.getElementById('hostChatInput');
  const message = input.value.trim();
  if (message && message.length > 0 && message.length <= 200) {
    socket.emit('chatMessage', { roomId, message });
    input.value = '';
  }
});

document.getElementById('waitingSendChatBtn').addEventListener('click', () => {
  const input = document.getElementById('waitingChatInput');
  const message = input.value.trim();
  if (message && message.length > 0 && message.length <= 200) {
    socket.emit('chatMessage', { roomId, message });
    input.value = '';
  }
});
