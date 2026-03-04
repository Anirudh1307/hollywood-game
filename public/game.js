const socket = io();
const roomId = window.location.pathname.split('/')[2];
let gameState = null;
let mySocketId = null;
let chatMessages = [];
let wasHost = false;
let lastRendered = {};
let statsOpen = false;
let gameStats = {};

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

socket.on('bonusAwarded', (data) => {
  showBonusAnimation(data.playerId, data.points);
});

function showBonusAnimation(playerId, points) {
  console.log('Bonus animation triggered for player:', playerId, 'points:', points);
  const scoreboard = document.getElementById('scoreboard');
  if (!scoreboard || !gameState) {
    console.log('No scoreboard or gameState');
    return;
  }
  
  // Find player in sorted list
  const playerIndex = gameState.sortedPlayers.findIndex(p => p.socketId === playerId);
  console.log('Player index in sorted list:', playerIndex);
  if (playerIndex === -1) return;
  
  // Get all player rows
  const playerRows = scoreboard.querySelectorAll('.player-row');
  console.log('Found player rows:', playerRows.length);
  
  if (playerIndex >= playerRows.length) {
    console.log('Player index exceeds available rows');
    return;
  }
  
  const targetRow = playerRows[playerIndex];
  console.log('Target row found:', targetRow);
  
  const popup = document.createElement('div');
  popup.className = 'bonusPopup';
  popup.textContent = `+${points} Bonus`;
  popup.style.position = 'absolute';
  popup.style.left = '10px';
  popup.style.top = (targetRow.offsetTop + 5) + 'px';
  popup.style.zIndex = '1001';
  popup.style.color = '#00ff66';
  popup.style.fontSize = '16px';
  popup.style.fontWeight = 'bold';
  popup.style.pointerEvents = 'none';
  popup.style.textShadow = '1px 1px 2px rgba(0,0,0,0.5)';
  
  scoreboard.appendChild(popup);
  console.log('Bonus popup added to scoreboard');
  
  setTimeout(() => {
    if (popup.parentNode) {
      popup.remove();
      console.log('Bonus popup removed');
    }
  }, 3000);
}

socket.on('statsUpdate', (stats) => {
  gameStats = stats;
  if (statsOpen) renderStats();
});

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

socket.on('hostSecretWord', (data) => {
  if (gameState) {
    if (typeof data === 'string') {
      gameState.hostSecretWord = data;
      gameState.hostRevealed = gameState.revealed;
    } else {
      gameState.hostSecretWord = data.secretWord;
      gameState.hostRevealed = data.revealed;
    }
    renderHostSecretDisplay();
    renderHostView();
  }
});

socket.on('hostRoundUpdate', (data) => {
  if (gameState) {
    gameState.roundGuesses = data.roundGuesses;
    gameState.remainingGuessers = data.remainingGuessers;
    renderHostRoundLog();
  }
});

socket.on('roundResult', (data) => {
  if (gameState && data && data.word) {
    gameState.resultWord = data.word;
    console.log('Received roundResult:', data);
  }
});

socket.on('kicked', () => {
  alert('You have been kicked from the room');
  window.location.href = '/';
});

socket.on('game-state', (state) => {
  const previousResultWord = gameState?.resultWord;
  gameState = state;
  if (!gameState.hostSecretWord) gameState.hostSecretWord = '';
  if (previousResultWord) gameState.resultWord = previousResultWord;
  if (gameState.word && !gameState.resultWord) gameState.resultWord = gameState.word;
  
  document.getElementById('nameSetup').style.display = 'none';
  
  const isHost = gameState.hostSocketId === mySocketId;
  
  if (isHost && !wasHost) {
    resetHostForm();
  }
  wasHost = isHost;
  
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
  renderHollywoodLives();
  renderRevealedWord();
  renderClues();
  renderKeypad();
  renderHistory();
  renderGameOver();
  renderScoreboard();
  renderTurnInfo();
  renderHostView();
  renderHostSecretDisplay();
  renderTimer();
  renderChat();
}

function renderHostRoundLog() {
  const logPanel = document.getElementById('hostRoundLog');
  if (!logPanel) return;
  
  const isHost = gameState.hostSocketId === mySocketId;
  const isRoundActive = gameState.roomState === 'round_active';
  
  if (isHost && isRoundActive && gameState.roundGuesses) {
    logPanel.style.display = 'block';
    
    const remainingDiv = document.getElementById('hostRemainingGuessers');
    if (remainingDiv) {
      remainingDiv.textContent = `Remaining players to guess: ${gameState.remainingGuessers}`;
    }
    
    const guessList = document.getElementById('hostGuessList');
    if (guessList) {
      guessList.innerHTML = gameState.roundGuesses.map(guess => {
        const resultText = guess.result === 'correct_letter' ? '✓ Correct Letter' :
                          guess.result === 'wrong_letter' ? '✗ Wrong Letter' :
                          guess.result === 'correct_word' ? '✓ Correct Word' :
                          '✗ Wrong Word';
        return `<div class="guess-item"><strong>${escapeHtml(guess.playerName)}</strong> guessed "${escapeHtml(guess.value)}" (${resultText})</div>`;
      }).join('');
    }
  } else {
    logPanel.style.display = 'none';
  }
}

function renderHostView() {
  const hostPanel = document.getElementById('hostSecretWord');
  if (!hostPanel) return;
  
  const isHost = gameState.hostSocketId === mySocketId;
  const isRoundActive = gameState.roomState === 'round_active';
  
  const cacheKey = `${gameState.hostSecretWord}-${(gameState.hostRevealed || gameState.revealed).join('')}`;
  if (lastRendered.hostView === cacheKey) return;
  lastRendered.hostView = cacheKey;
  
  if (isHost && isRoundActive && gameState.hostSecretWord) {
    hostPanel.style.display = 'block';
    
    const secretWordFormatted = gameState.hostSecretWord.split('').join(' ');
    const revealedFormatted = (gameState.hostRevealed || gameState.revealed).join(' ');
    
    const wordDisplay = document.getElementById('hostWordDisplay');
    if (wordDisplay) {
      wordDisplay.innerHTML = `
        <div style="margin-bottom: 10px;">
          <span style="color: #666; font-size: 0.9em;">Secret Word: </span>
          <span style="font-weight: bold; color: #333;">${secretWordFormatted}</span>
        </div>
        <div>
          <span style="color: #666; font-size: 0.9em;">Revealed: </span>
          <span style="font-weight: bold; color: #667eea;">${revealedFormatted}</span>
        </div>
      `;
    }
  } else {
    hostPanel.style.display = 'none';
  }
  
  renderHostRoundLog();
}

function renderHostSecretDisplay() {
  const hostContainer = document.getElementById('hostSecretContainer');
  if (!hostContainer) return;
  
  const isHost = gameState.hostSocketId === mySocketId;
  const isRoundActive = gameState.roomState === 'round_active';
  const shouldShow = isHost && isRoundActive && gameState.hostSecretWord;
  
  const cacheKey = `${gameState.hostSecretWord}-${(gameState.hostRevealed || gameState.revealed).join('')}`;
  if (lastRendered.hostSecret === cacheKey) return;
  lastRendered.hostSecret = cacheKey;
  
  if (shouldShow) {
    hostContainer.style.display = 'block';
    
    const secretWordFormatted = gameState.hostSecretWord.split('').join(' ');
    const revealedFormatted = (gameState.hostRevealed || gameState.revealed).join(' ');
    
    hostContainer.innerHTML = `
      <p style="color: #666; font-size: 0.9em; margin-bottom: 5px;">Secret Word:</p>
      <p style="font-size: 1.2em; font-weight: bold; color: #333; margin-bottom: 10px;">${secretWordFormatted}</p>
      <p style="color: #666; font-size: 0.9em; margin-bottom: 5px;">Revealed:</p>
      <p style="font-size: 1.2em; font-weight: bold; color: #667eea;">${revealedFormatted}</p>
    `;
  } else {
    hostContainer.style.display = 'none';
  }
}

function renderTimer() {
  const timerDiv = document.getElementById('turnTimer');
  if (!timerDiv) return;
  
  if (gameState.roomState === 'round_active' && gameState.timerSeconds !== undefined) {
    timerDiv.textContent = `⏱️ Time: ${gameState.timerSeconds}s`;
  } else {
    timerDiv.textContent = '';
  }
}

function renderTurnInfo() {
  const indicator = document.getElementById('turnIndicator');
  if (!indicator) return;
  
  const isHost = gameState.hostSocketId === mySocketId;
  const isMyTurn = gameState.turnSocketId === mySocketId;
  const currentTurnName = gameState.currentTurnPlayerName || 'Unknown';
  const key = `${isHost}-${isMyTurn}-${currentTurnName}`;
  
  if (lastRendered.turnInfo === key) return;
  lastRendered.turnInfo = key;
  
  if (isHost) {
    indicator.innerHTML = `<div class="turn-msg host-msg">You are the host - Current Turn: ${escapeHtml(currentTurnName)}</div>`;
  } else if (isMyTurn) {
    indicator.innerHTML = '<div class="turn-msg my-turn">🎯 YOUR TURN TO GUESS!</div>';
  } else {
    indicator.innerHTML = `<div class="turn-msg waiting-turn">Waiting for ${escapeHtml(currentTurnName)}'s turn...</div>`;
  }
}

function renderHollywoodLives() {
  const display = document.getElementById('hollywoodDisplay');
  if (!display) return;
  
  if (lastRendered.hollywoodIndex === gameState.hollywoodIndex) return;
  lastRendered.hollywoodIndex = gameState.hollywoodIndex;
  
  const hollywood = 'HOLLYWOOD';
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

function renderRevealedWord() {
  const display = document.getElementById('wordDisplay');
  if (!display) return;
  
  const revealedStr = gameState.revealed.join('');
  if (lastRendered.revealed === revealedStr) return;
  lastRendered.revealed = revealedStr;
  
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
          <p class="word-reveal">${gameState.resultWord || gameState.word}</p>
          <p>Next round starting...</p>
        </div>
      `;
    } else {
      message.innerHTML = `
        <div class="overlay-content">
          <h2>💀 ROUND FAILED 💀</h2>
          <p>The word was:</p>
          <p class="word-reveal">${gameState.resultWord || gameState.word}</p>
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
  
  const scoreKey = JSON.stringify(gameState.scores) + gameState.round + gameState.hostIndex;
  if (lastRendered.scoreboard === scoreKey) return;
  lastRendered.scoreboard = scoreKey;
  
  const hostName = gameState.players[gameState.hostIndex]?.username || 'Host';
  let html = `<h4>Round ${gameState.round} - Current Host: ${hostName}</h4>`;
  
  gameState.sortedPlayers.forEach(player => {
    const isCurrentHost = player.socketId === gameState.hostSocketId;
    const playerIndex = gameState.players.indexOf(player);
    const isMasterHost = gameState.masterHostIndex === playerIndex;
    const prefix = isCurrentHost ? '👑 ' : (isMasterHost ? '⭐ ' : '');
    const suffix = player.socketId === mySocketId ? ' (You)' : '';
    const isMeTheMasterHost = gameState.masterHostIndex === gameState.players.findIndex(p => p.socketId === mySocketId);
    const kickBtn = isMeTheMasterHost && player.socketId !== mySocketId ? 
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

function renderStats() {
  const panel = document.getElementById('statsPanel');
  if (!panel) return;
  
  let html = '<button id="closeStats" style="position:absolute;top:10px;right:10px;background:#e74c3c;color:white;border:none;padding:8px 15px;border-radius:5px;cursor:pointer;font-weight:bold;">✕ Close</button>';
  html += '<h3>Player Statistics</h3><table class="stats-table"><thead><tr><th>Player</th><th>Letters</th><th>Words</th><th>Guesses</th><th>Fastest</th></tr></thead><tbody>';
  
  gameState.players.forEach(p => {
    const stats = gameStats[p.socketId] || { correctLetters: 0, correctWords: 0, totalGuesses: 0, fastestGuessTime: null };
    const fastest = stats.fastestGuessTime ? stats.fastestGuessTime.toFixed(1) + 's' : '-';
    html += `<tr><td>${escapeHtml(p.username)}</td><td>${stats.correctLetters}</td><td>${stats.correctWords}</td><td>${stats.totalGuesses}</td><td>${fastest}</td></tr>`;
  });
  
  html += '</tbody></table>';
  panel.innerHTML = html;
  
  const closeBtn = document.getElementById('closeStats');
  if (closeBtn) {
    closeBtn.onclick = () => {
      statsOpen = false;
      panel.classList.remove('open');
    };
  }
}

function resetHostForm() {
  const wordInput = document.getElementById('wordInput');
  if (wordInput) wordInput.value = '';
  
  const clue1 = document.getElementById('clue1');
  const clue2 = document.getElementById('clue2');
  const clue3 = document.getElementById('clue3');
  if (clue1) clue1.value = '';
  if (clue2) clue2.value = '';
  if (clue3) clue3.value = '';
}

function kickPlayer(targetSocketId) {
  socket.emit('kickPlayer', { roomId, targetSocketId });
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

setTimeout(() => {
  const toggle = document.getElementById('statsToggle');
  const panel = document.getElementById('statsPanel');
  
  if (toggle && panel) {
    toggle.addEventListener('click', () => {
      statsOpen = !statsOpen;
      panel.classList.toggle('open');
      if (statsOpen && gameState) renderStats();
    });
  }
}, 100);
