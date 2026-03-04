const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));
app.use(express.json());

const rooms = {};

function isAlphanumeric(char) {
  return /[A-Z0-9]/.test(char);
}

function normalizeForComparison(word) {
  return word.toUpperCase().split('').filter(isAlphanumeric).join('');
}

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/room/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

app.post('/create-room', (req, res) => {
  const roomId = generateRoomId();
  res.json({ roomId });
});

app.post('/validate-room', (req, res) => {
  const { roomId } = req.body;
  const exists = !!rooms[roomId];
  res.json({ exists });
});

function getNextTurnIndex(room) {
  if (room.players.length < 2) return null;
  if (room.players.length === 2) {
    return room.hostIndex === 0 ? 1 : 0;
  }
  let next = (room.turnIndex + 1) % room.players.length;
  while (next === room.hostIndex) {
    next = (next + 1) % room.players.length;
  }
  return next;
}

function getSortedPlayers(room) {
  return [...room.players].sort((a, b) => (room.scores[b.socketId] || 0) - (room.scores[a.socketId] || 0));
}

function broadcastRoomState(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  
  const currentHost = room.players[room.hostIndex];
  const currentTurnPlayer = room.turnIndex !== null ? room.players[room.turnIndex] : null;
  
  const state = {
    players: room.players,
    sortedPlayers: getSortedPlayers(room),
    hostIndex: room.hostIndex,
    turnIndex: room.turnIndex,
    hostSocketId: currentHost?.socketId,
    turnSocketId: currentTurnPlayer?.socketId,
    currentTurnPlayerName: currentTurnPlayer?.username || '',
    roomState: room.roomState,
    clues: room.clues,
    revealed: room.revealed,
    correctLetters: room.correctLetters,
    wrongLetters: room.wrongLetters,
    wrongWords: room.wrongWords,
    hollywoodIndex: room.hollywoodIndex,
    gameOver: room.gameOver,
    winner: room.winner,
    scores: room.scores,
    round: room.round,
    messages: room.messages,
    masterHostIndex: room.masterHostIndex,
    timerSeconds: room.timerSeconds,
    word: room.roomState === 'round_ended' ? room.word : undefined
  };
  
  io.to(roomId).emit('game-state', state);
  io.to(roomId).emit('statsUpdate', room.stats);
  
  if (currentHost && room.roomState === 'round_active' && room.word) {
    io.to(currentHost.socketId).emit('hostSecretWord', {
      secretWord: room.word,
      revealed: room.revealed
    });
  }
  
  if (currentHost && room.roomState === 'round_active') {
    const totalEligiblePlayers = room.players.length - 1;
    const remainingGuessers = totalEligiblePlayers - room.playersWhoGuessedThisRound.size;
    io.to(currentHost.socketId).emit('hostRoundUpdate', {
      roundGuesses: room.roundGuesses,
      remainingGuessers: remainingGuessers
    });
  }
}

function clearTimers(room) {
  if (room.timers.hostTimer) clearTimeout(room.timers.hostTimer);
  if (room.timers.turnTimer) clearTimeout(room.timers.turnTimer);
  if (room.timers.countdownInterval) clearInterval(room.timers.countdownInterval);
}

io.on('connection', (socket) => {
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    
    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: [],
        masterHostIndex: 0,
        hostIndex: 0,
        turnIndex: null,
        roomState: 'waiting_for_host_input',
        word: '',
        clues: [],
        revealed: [],
        correctLetters: [],
        wrongLetters: [],
        wrongWords: [],
        hollywoodIndex: 0,
        gameOver: false,
        winner: false,
        scores: {},
        round: 1,
        chatHistory: [],
        timers: { hostTimer: null, turnTimer: null, countdownInterval: null },
        timerSeconds: 0,
        roundGuesses: [],
        playersWhoGuessedThisRound: new Set(),
        stats: {},
        turnStartTime: null
      };
    }
    
    socket.emit('chatHistory', rooms[roomId].chatHistory);
    socket.emit('need-name', true);
  });

  socket.on('set-name', ({ roomId, name }) => {
    const room = rooms[roomId];
    if (!room) return;

    const existingPlayer = room.players.find(p => p.socketId === socket.id);
    
    if (!existingPlayer) {
      room.players.push({ socketId: socket.id, username: name });
      room.scores[socket.id] = 0;
      room.stats[socket.id] = { correctLetters: 0, correctWords: 0, totalGuesses: 0, fastestGuessTime: null };
    }
    
    if (room.players.length < 2) {
      room.roomState = 'waiting_for_players';
    } else if (room.roomState === 'waiting_for_players') {
      room.roomState = 'waiting_for_host_input';
    }
    
    broadcastRoomState(roomId);
  });

  socket.on('start-game', ({ roomId, word, clues }) => {
    const room = rooms[roomId];
    if (!room) return;
    
    if (room.players.length < 2) {
      socket.emit('error', 'At least 2 players required to start.');
      return;
    }
    
    const currentHost = room.players[room.hostIndex];
    if (!currentHost || currentHost.socketId !== socket.id) return;
    if (room.roomState !== 'waiting_for_host_input') return;

    clearTimers(room);
    
    room.word = word.toUpperCase();
    room.clues = clues.filter(c => c.trim());
    
    room.revealed = [];
    for (let i = 0; i < room.word.length; i++) {
      const char = room.word[i];
      room.revealed.push(isAlphanumeric(char) ? '_' : char);
    }
    
    room.roomState = 'round_active';
    room.gameOver = false;
    room.winner = false;
    room.correctLetters = [];
    room.wrongLetters = [];
    room.wrongWords = [];
    room.hollywoodIndex = 0;
    room.roundGuesses = [];
    room.playersWhoGuessedThisRound = new Set();
    
    room.turnIndex = (room.hostIndex + 1) % room.players.length;
    room.timerSeconds = 120;
    room.turnStartTime = Date.now();
    
    room.timers.countdownInterval = setInterval(() => {
      room.timerSeconds--;
      if (room.timerSeconds <= 0) {
        clearInterval(room.timers.countdownInterval);
        room.timers.countdownInterval = null;
      }
      broadcastRoomState(roomId);
    }, 1000);
    
    room.timers.turnTimer = setTimeout(() => {
      if (rooms[roomId] && room.roomState === 'round_active') {
        room.turnIndex = getNextTurnIndex(room);
        room.timerSeconds = 120;
        broadcastRoomState(roomId);
      }
    }, 120000);

    broadcastRoomState(roomId);
  });

  socket.on('skip-round', (roomId) => {
    const room = rooms[roomId];
    if (!room) return;
    
    const currentHost = room.players[room.hostIndex];
    if (!currentHost || currentHost.socketId !== socket.id) return;
    if (room.roomState !== 'waiting_for_host_input') return;

    clearTimers(room);
    
    room.hostIndex = (room.hostIndex + 1) % room.players.length;
    room.turnIndex = null;
    room.word = '';
    room.clues = [];
    room.revealed = [];
    room.correctLetters = [];
    room.wrongLetters = [];
    room.wrongWords = [];
    room.hollywoodIndex = 0;
    room.roomState = 'waiting_for_host_input';

    broadcastRoomState(roomId);
  });

  socket.on('guess-letter', ({ roomId, letter }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.roomState !== 'round_active') return;
    if (room.players.length < 2) return;
    
    const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
    if (playerIndex === -1) return;
    if (playerIndex !== room.turnIndex) return;
    if (playerIndex === room.hostIndex) return;

    const upperLetter = letter.toUpperCase();
    
    if (!/^[A-Z0-9]$/.test(upperLetter)) return;
    
    if (room.correctLetters.includes(upperLetter) || room.wrongLetters.includes(upperLetter)) {
      return;
    }

    const playerName = room.players[playerIndex].username;
    room.playersWhoGuessedThisRound.add(socket.id);
    
    const guessTime = (Date.now() - room.turnStartTime) / 1000;
    room.stats[socket.id].totalGuesses++;
    if (!room.stats[socket.id].fastestGuessTime || guessTime < room.stats[socket.id].fastestGuessTime) {
      room.stats[socket.id].fastestGuessTime = guessTime;
    }

    if (room.word.includes(upperLetter)) {
      room.correctLetters.push(upperLetter);
      room.stats[socket.id].correctLetters++;
      
      // Check unrevealed count BEFORE revealing the letter
      let unrevealedBeforeReveal = 0;
      for (let i = 0; i < room.word.length; i++) {
        if (/[A-Z0-9]/.test(room.word[i]) && room.revealed[i] === '_') {
          unrevealedBeforeReveal++;
        }
      }
      
      let points = 2;
      if (guessTime <= 20) points += 3;
      if (unrevealedBeforeReveal === 1) points += 2; // Final letter bonus
      
      room.scores[socket.id] = (room.scores[socket.id] || 0) + points;
      
      if (points > 2) {
        io.to(roomId).emit('bonusAwarded', { playerId: socket.id, points: points - 2 });
      }
      
      room.roundGuesses.push({
        playerName,
        guessType: 'letter',
        value: upperLetter,
        result: 'correct_letter',
        timestamp: Date.now()
      });
      for (let i = 0; i < room.word.length; i++) {
        if (room.word[i] === upperLetter) {
          room.revealed[i] = upperLetter;
        }
      }
      
      let allRevealed = true;
      for (let i = 0; i < room.word.length; i++) {
        if (/[A-Z0-9]/.test(room.word[i]) && room.revealed[i] === '_') {
          allRevealed = false;
          break;
        }
      }
      
      if (allRevealed) {
        clearTimers(room);
        room.gameOver = true;
        room.winner = true;
        room.roomState = 'round_ended';
        
        const finalWord = room.word;
        console.log('Emitting roundResult with word:', finalWord);
        io.to(roomId).emit('roundResult', { word: finalWord, winner: true });
        broadcastRoomState(roomId);
        
        setTimeout(() => {
          if (rooms[roomId]) {
            room.hostIndex = (room.hostIndex + 1) % room.players.length;
            room.round++;
            room.turnIndex = null;
            room.word = '';
            room.clues = [];
            room.revealed = [];
            room.correctLetters = [];
            room.wrongLetters = [];
            room.wrongWords = [];
            room.hollywoodIndex = 0;
            room.gameOver = false;
            room.winner = false;
            room.roomState = 'waiting_for_host_input';
            room.roundGuesses = [];
            room.playersWhoGuessedThisRound = new Set();
            broadcastRoomState(roomId);
          }
        }, 5000);
        return;
      }
    } else {
      room.wrongLetters.push(upperLetter);
      room.roundGuesses.push({
        playerName,
        guessType: 'letter',
        value: upperLetter,
        result: 'wrong_letter',
        timestamp: Date.now()
      });
      room.hollywoodIndex++;
      
      if (room.hollywoodIndex >= 9) {
        clearTimers(room);
        room.gameOver = true;
        room.winner = false;
        room.roomState = 'round_ended';
        room.scores[room.players[room.hostIndex].socketId] = (room.scores[room.players[room.hostIndex].socketId] || 0) + 10;
        
        const finalWord = room.word;
        console.log('Emitting roundResult with word:', finalWord);
        io.to(roomId).emit('roundResult', { word: finalWord, winner: false });
        broadcastRoomState(roomId);
        
        setTimeout(() => {
          if (rooms[roomId]) {
            room.hostIndex = (room.hostIndex + 1) % room.players.length;
            room.round++;
            room.turnIndex = null;
            room.word = '';
            room.clues = [];
            room.revealed = [];
            room.correctLetters = [];
            room.wrongLetters = [];
            room.wrongWords = [];
            room.hollywoodIndex = 0;
            room.gameOver = false;
            room.winner = false;
            room.roomState = 'waiting_for_host_input';
            room.roundGuesses = [];
            room.playersWhoGuessedThisRound = new Set();
            broadcastRoomState(roomId);
          }
        }, 5000);
        return;
      }
    }

    clearTimers(room);
    room.turnIndex = getNextTurnIndex(room);
    room.timerSeconds = 120;
    room.turnStartTime = Date.now();
    
    room.timers.countdownInterval = setInterval(() => {
      room.timerSeconds--;
      if (room.timerSeconds <= 0) {
        clearInterval(room.timers.countdownInterval);
        room.timers.countdownInterval = null;
      }
      broadcastRoomState(roomId);
    }, 1000);
    
    room.timers.turnTimer = setTimeout(() => {
      if (rooms[roomId] && room.roomState === 'round_active') {
        room.turnIndex = getNextTurnIndex(room);
        room.timerSeconds = 120;
        broadcastRoomState(roomId);
      }
    }, 120000);
    
    broadcastRoomState(roomId);
  });

  socket.on('guess-word', ({ roomId, word }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.roomState !== 'round_active') return;
    if (room.players.length < 2) return;
    
    const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
    if (playerIndex === -1) return;
    if (playerIndex !== room.turnIndex) return;
    if (playerIndex === room.hostIndex) return;

    const upperWord = word.toUpperCase().trim();
    if (!upperWord) return;
    
    const normalizedGuess = normalizeForComparison(upperWord);
    const normalizedSecret = normalizeForComparison(room.word);
    
    if (room.wrongWords.includes(normalizedGuess)) return;

    const playerName = room.players[playerIndex].username;
    room.playersWhoGuessedThisRound.add(socket.id);
    
    const guessTime = (Date.now() - room.turnStartTime) / 1000;
    room.stats[socket.id].totalGuesses++;
    if (!room.stats[socket.id].fastestGuessTime || guessTime < room.stats[socket.id].fastestGuessTime) {
      room.stats[socket.id].fastestGuessTime = guessTime;
    }

    if (normalizedGuess === normalizedSecret) {
      room.stats[socket.id].correctWords++;
      
      let points = 10;
      if (guessTime <= 20) points += 3;
      room.scores[socket.id] = (room.scores[socket.id] || 0) + points;
      
      if (points > 10) {
        io.to(roomId).emit('bonusAwarded', { playerId: socket.id, points: 3 });
      }
      
      room.roundGuesses.push({
        playerName,
        guessType: 'word',
        value: upperWord,
        result: 'correct_word',
        timestamp: Date.now()
      });
      clearTimers(room);
      room.revealed = room.word.split('');
      room.gameOver = true;
      room.winner = true;
      room.roomState = 'round_ended';
      
      const finalWord = room.word;
      console.log('Emitting roundResult with word:', finalWord);
      io.to(roomId).emit('roundResult', { word: finalWord, winner: true });
      broadcastRoomState(roomId);
      
      setTimeout(() => {
        if (rooms[roomId]) {
          room.hostIndex = (room.hostIndex + 1) % room.players.length;
          room.round++;
          room.turnIndex = null;
          room.word = '';
          room.clues = [];
          room.revealed = [];
          room.correctLetters = [];
          room.wrongLetters = [];
          room.wrongWords = [];
          room.hollywoodIndex = 0;
          room.gameOver = false;
          room.winner = false;
          room.roomState = 'waiting_for_host_input';
          room.roundGuesses = [];
          room.playersWhoGuessedThisRound = new Set();
          broadcastRoomState(roomId);
        }
      }, 5000);
      return;
    } else {
      room.wrongWords.push(normalizedGuess);
      room.roundGuesses.push({
        playerName,
        guessType: 'word',
        value: upperWord,
        result: 'wrong_word',
        timestamp: Date.now()
      });
      room.hollywoodIndex++;
      
      if (room.hollywoodIndex >= 9) {
        clearTimers(room);
        room.gameOver = true;
        room.winner = false;
        room.roomState = 'round_ended';
        room.scores[room.players[room.hostIndex].socketId] = (room.scores[room.players[room.hostIndex].socketId] || 0) + 10;
        
        const finalWord = room.word;
        console.log('Emitting roundResult with word:', finalWord);
        io.to(roomId).emit('roundResult', { word: finalWord, winner: false });
        broadcastRoomState(roomId);
        
        setTimeout(() => {
          if (rooms[roomId]) {
            room.hostIndex = (room.hostIndex + 1) % room.players.length;
            room.round++;
            room.turnIndex = null;
            room.word = '';
            room.clues = [];
            room.revealed = [];
            room.correctLetters = [];
            room.wrongLetters = [];
            room.wrongWords = [];
            room.hollywoodIndex = 0;
            room.gameOver = false;
            room.winner = false;
            room.roomState = 'waiting_for_host_input';
            room.roundGuesses = [];
            room.playersWhoGuessedThisRound = new Set();
            broadcastRoomState(roomId);
          }
        }, 5000);
        return;
      }
    }

    clearTimers(room);
    room.turnIndex = getNextTurnIndex(room);
    room.timerSeconds = 120;
    room.turnStartTime = Date.now();
    
    room.timers.countdownInterval = setInterval(() => {
      room.timerSeconds--;
      if (room.timerSeconds <= 0) {
        clearInterval(room.timers.countdownInterval);
        room.timers.countdownInterval = null;
      }
      broadcastRoomState(roomId);
    }, 1000);
    
    room.timers.turnTimer = setTimeout(() => {
      if (rooms[roomId] && room.roomState === 'round_active') {
        room.turnIndex = getNextTurnIndex(room);
        room.timerSeconds = 120;
        broadcastRoomState(roomId);
      }
    }, 120000);
    
    broadcastRoomState(roomId);
  });

  socket.on('chatMessage', ({ roomId, message }) => {
    const room = rooms[roomId];
    if (!room) return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    const text = String(message).trim();
    if (!text || text.length === 0 || text.length > 200) return;

    const chatMsg = {
      sender: player.username,
      message: text,
      timestamp: Date.now()
    };

    room.chatHistory.push(chatMsg);
    if (room.chatHistory.length > 50) {
      room.chatHistory.shift();
    }

    io.to(roomId).emit('chatUpdate', chatMsg);
  });

  socket.on('kickPlayer', ({ roomId, targetSocketId }) => {
    const room = rooms[roomId];
    if (!room) return;
    
    const kickerIndex = room.players.findIndex(p => p.socketId === socket.id);
    if (kickerIndex === -1 || kickerIndex !== room.masterHostIndex) return;
    
    const targetIndex = room.players.findIndex(p => p.socketId === targetSocketId);
    if (targetIndex === -1) return;
    
    room.players.splice(targetIndex, 1);
    delete room.scores[targetSocketId];
    
    if (targetIndex < room.hostIndex) {
      room.hostIndex--;
    } else if (targetIndex === room.hostIndex) {
      room.hostIndex = room.hostIndex % room.players.length;
    }
    
    if (targetIndex < room.masterHostIndex) {
      room.masterHostIndex--;
    } else if (targetIndex === room.masterHostIndex) {
      room.masterHostIndex = 0;
    }
    
    if (room.turnIndex !== null) {
      if (targetIndex < room.turnIndex) {
        room.turnIndex--;
      } else if (targetIndex === room.turnIndex) {
        room.turnIndex = getNextTurnIndex(room);
      }
    }
    
    if (room.players.length < 2) {
      clearTimers(room);
      room.roomState = 'waiting_for_players';
      room.turnIndex = null;
      room.word = '';
      room.clues = [];
      room.revealed = [];
      room.gameOver = false;
    } else {
      room.roomState = 'waiting_for_host_input';
      room.word = '';
      room.clues = [];
      room.revealed = [];
      room.gameOver = false;
      room.turnIndex = null;
    }
    
    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (targetSocket) {
      targetSocket.emit('kicked');
      targetSocket.disconnect();
    }
    
    broadcastRoomState(roomId);
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
      
      if (playerIndex > -1) {
        room.players.splice(playerIndex, 1);
        delete room.scores[socket.id];
        delete room.stats[socket.id];
        
        if (room.players.length === 0) {
          clearTimers(room);
          delete rooms[roomId];
        } else {
          if (playerIndex < room.hostIndex) {
            room.hostIndex--;
          } else if (playerIndex === room.hostIndex) {
            room.hostIndex = room.hostIndex % room.players.length;
          }
          
          if (playerIndex < room.masterHostIndex) {
            room.masterHostIndex--;
          } else if (playerIndex === room.masterHostIndex) {
            room.masterHostIndex = 0;
          }
          
          if (room.turnIndex !== null) {
            if (playerIndex < room.turnIndex) {
              room.turnIndex--;
            } else if (playerIndex === room.turnIndex) {
              room.turnIndex = getNextTurnIndex(room);
            }
          }
          
          if (room.players.length < 2) {
            clearTimers(room);
            room.roomState = 'waiting_for_players';
            room.turnIndex = null;
            room.word = '';
            room.clues = [];
            room.revealed = [];
            room.gameOver = false;
          } else if (room.roomState === 'waiting_for_players') {
            room.roomState = 'waiting_for_host_input';
          }
          
          broadcastRoomState(roomId);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
