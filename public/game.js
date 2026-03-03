const socket = io();
const roomId = window.location.pathname.split('/')[2];
let isHost = false;
let gameState = null;
let mySocketId = null;
let needName = false;

socket.on('connect', () => {
  mySocketId = socket.id;
});

document.getElementById('roomId').textContent = roomId;

socket.emit('join-room', roomId);

socket.on('need-name', (need) => {
  needName = need;
  if (needName) {
    document.getElementById('nameSetup').style.display = 'block';
  }
});

socket.on('is-host', (host) => {
  isHost = host;
});

socket.on('game-state', (state) => {
  gameState = state;
  document.getElementById('nameSetup').style.display = 'none';
  
  if (!gameState.gameStarted && isHost) {
    document.getElementById('hostSetup').style.display = 'block';
    document.getElementById('waitingArea').style.display = 'none';
    document.getElementById('gameArea').style.display = 'none';
  } else if (!gameState.gameStarted && !isHost) {
    document.getElementById('hostSetup').style.display = 'none';
    document.getElementById('waitingArea').style.display = 'block';
    document.getElementById('gameArea').style.display = 'none';
    const hostName = gameState.playerNames[gameState.hostSocketId] || 'Host';
    document.getElementById('currentHostName').textContent = hostName;
  } else {
    document.getElementById('hostSetup').style.display = 'none';
    document.getElementById('waitingArea').style.display = 'none';
    document.getElementById('gameArea').style.display = 'block';
  }
  
  renderGame();
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
  renderChat();
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
  
  for (const letter of alphabet) {
    const button = document.createElement('button');
    button.className = 'key';
    button.textContent = letter;
    
    const used = gameState.correctLetters.includes(letter) || 
                  gameState.wrongLetters.includes(letter);
    
    if (used || gameState.gameOver || isHost) {
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
  
  if (isHost) {
    input.disabled = true;
    button.disabled = true;
  } else if (gameState.gameOver) {
    input.disabled = true;
    button.disabled = true;
  } else {
    input.disabled = false;
    button.disabled = false;
  }
  
  if (gameState.gameOver) {
    message.style.display = 'block';
    message.className = gameState.winner ? 'game-over win' : 'game-over lose';
    
    const allPlayersHosted = gameState.players.every(p => gameState.playersHosted && gameState.playersHosted.includes(p));
    
    if (allPlayersHosted) {
      message.innerHTML = gameState.winner 
        ? `<h2>🎉 YOU WIN! 🎉</h2><p>The word was: ${gameState.word}</p><p>All players have hosted. Game complete!</p>`
        : `<h2>💀 GAME OVER 💀</h2><p>The word was: ${gameState.word}</p><p>All players have hosted. Game complete!</p>`;
    } else {
      const nextHostName = gameState.playerNames[gameState.nextHostId] || 'Next player';
      message.innerHTML = gameState.winner 
        ? `<h2>🎉 YOU WIN! 🎉</h2><p>The word was: ${gameState.word}</p><p>Next host: ${nextHostName}</p>`
        : `<h2>💀 GAME OVER 💀</h2><p>The word was: ${gameState.word}</p><p>Next host: ${nextHostName}</p>`;
      
      setTimeout(() => {
        socket.emit('next-round', roomId);
      }, 3000);
    }
  } else {
    message.style.display = 'none';
  }
}

function renderScoreboard() {
  const scoreboard = document.getElementById('scoreboard');
  if (!scoreboard) return;
  
  const hostName = gameState.playerNames[gameState.hostSocketId] || 'Host';
  let html = `<h4>Round ${gameState.round} - Current Host: ${hostName}</h4>`;
  for (const playerId in gameState.scores) {
    const isCurrentHost = playerId === gameState.hostSocketId;
    const prefix = isCurrentHost ? '👑 ' : '';
    const suffix = playerId === mySocketId ? ' (You)' : '';
    const playerName = gameState.playerNames[playerId] || 'Player';
    html += `<div>${prefix}${playerName}${suffix}: ${gameState.scores[playerId]}</div>`;
  }
  scoreboard.innerHTML = html;
}

function renderChat() {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages || !gameState || !gameState.messages) return;
  
  chatMessages.innerHTML = gameState.messages.map(msg => {
    const isMe = msg.socketId === mySocketId;
    const name = msg.name || 'Unknown';
    return `<div class="chat-msg"><strong>${name}${isMe ? ' (You)' : ''}:</strong> ${msg.message}</div>`;
  }).join('');
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

socket.on('chat-message', (msg) => {
  if (gameState) {
    renderChat();
  }
});

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
  if (message) {
    socket.emit('chat-message', { roomId, message });
    input.value = '';
  }
});

document.getElementById('chatInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('sendChatBtn').click();
  }
});

socket.on('chat-message', () => {
  if (gameState) renderChat();
});
