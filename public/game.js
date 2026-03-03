const socket = io();
const roomId = window.location.pathname.split('/')[2];
let isHost = false;
let gameState = null;

document.getElementById('roomId').textContent = roomId;

socket.emit('join-room', roomId);

socket.on('is-host', (host) => {
  isHost = host;
  if (isHost) {
    document.getElementById('hostSetup').style.display = 'block';
  } else {
    document.getElementById('waitingArea').style.display = 'block';
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

socket.on('game-state', (state) => {
  gameState = state;
  document.getElementById('hostSetup').style.display = 'none';
  document.getElementById('waitingArea').style.display = 'none';
  document.getElementById('gameArea').style.display = 'block';
  
  renderGame();
});

function renderGame() {
  renderHollywood();
  renderWord();
  renderClues();
  renderKeypad();
  renderHistory();
  renderGameOver();
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
  
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  
  for (const letter of alphabet) {
    const button = document.createElement('button');
    button.className = 'key';
    button.textContent = letter;
    
    const used = gameState.correctLetters.includes(letter) || 
                  gameState.wrongLetters.includes(letter);
    
    if (used) {
      button.disabled = true;
      button.classList.add('used');
    }
    
    if (gameState.gameOver) {
      button.disabled = true;
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
  
  if (gameState.gameOver) {
    message.style.display = 'block';
    message.className = gameState.winner ? 'game-over win' : 'game-over lose';
    message.innerHTML = gameState.winner 
      ? `<h2>🎉 YOU WIN! 🎉</h2><p>The word was: ${gameState.word}</p>`
      : `<h2>💀 GAME OVER 💀</h2><p>The word was: ${gameState.word}</p>`;
    input.disabled = true;
    button.disabled = true;
  } else {
    message.style.display = 'none';
    input.disabled = false;
    button.disabled = false;
  }
}

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
