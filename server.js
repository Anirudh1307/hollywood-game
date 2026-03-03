const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

const rooms = {};

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

function getNextTurnIndex(room) {
  let next = (room.turnIndex + 1) % room.players.length;
  while (next === room.hostIndex) {
    next = (next + 1) % room.players.length;
  }
  return next;
}

function broadcastRoomState(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  
  const currentHost = room.players[room.hostIndex];
  const currentTurnPlayer = room.turnIndex !== null ? room.players[room.turnIndex] : null;
  
  const state = {
    players: room.players,
    hostIndex: room.hostIndex,
    turnIndex: room.turnIndex,
    hostSocketId: currentHost.socketId,
    turnSocketId: currentTurnPlayer ? currentTurnPlayer.socketId : null,
    roomState: room.roomState,
    word: room.word,
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
    messages: room.messages
  };
  
  io.to(roomId).emit('game-state', state);
}

io.on('connection', (socket) => {
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    
    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: [],
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
        messages: []
      };
    }
    
    const existingPlayer = rooms[roomId].players.find(p => p.socketId === socket.id);
    if (!existingPlayer) {
      rooms[roomId].scores[socket.id] = 0;
    }
    
    socket.emit('need-name', !existingPlayer);
  });

  socket.on('set-name', ({ roomId, name }) => {
    const room = rooms[roomId];
    if (!room) return;

    const existingPlayer = room.players.find(p => p.socketId === socket.id);
    if (!existingPlayer) {
      room.players.push({ socketId: socket.id, username: name });
      room.scores[socket.id] = 0;
    }
    
    broadcastRoomState(roomId);
  });

  socket.on('start-game', ({ roomId, word, clues }) => {
    const room = rooms[roomId];
    if (!room) return;
    
    const currentHost = room.players[room.hostIndex];
    if (!currentHost || currentHost.socketId !== socket.id) return;
    if (room.roomState !== 'waiting_for_host_input') return;

    room.word = word.toUpperCase();
    room.clues = clues.filter(c => c.trim());
    room.revealed = Array(word.length).fill('_');
    room.roomState = 'round_active';
    room.gameOver = false;
    room.winner = false;
    room.correctLetters = [];
    room.wrongLetters = [];
    room.wrongWords = [];
    room.hollywoodIndex = 0;
    
    room.turnIndex = (room.hostIndex + 1) % room.players.length;

    broadcastRoomState(roomId);
  });

  socket.on('skip-round', (roomId) => {
    const room = rooms[roomId];
    if (!room) return;
    
    const currentHost = room.players[room.hostIndex];
    if (!currentHost || currentHost.socketId !== socket.id) return;
    if (room.roomState !== 'waiting_for_host_input') return;

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
    
    const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
    if (playerIndex === -1) return;
    if (playerIndex !== room.turnIndex) return;
    if (playerIndex === room.hostIndex) return;

    const upperLetter = letter.toUpperCase();
    
    if (room.correctLetters.includes(upperLetter) || room.wrongLetters.includes(upperLetter)) {
      return;
    }

    if (room.word.includes(upperLetter)) {
      room.correctLetters.push(upperLetter);
      for (let i = 0; i < room.word.length; i++) {
        if (room.word[i] === upperLetter) {
          room.revealed[i] = upperLetter;
        }
      }
      
      if (!room.revealed.includes('_')) {
        room.gameOver = true;
        room.winner = true;
        room.roomState = 'round_ended';
        room.scores[socket.id] = (room.scores[socket.id] || 0) + 1;
        
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
            broadcastRoomState(roomId);
          }
        }, 3000);
        return;
      }
    } else {
      room.wrongLetters.push(upperLetter);
      room.hollywoodIndex++;
      
      if (room.hollywoodIndex >= 9) {
        room.gameOver = true;
        room.winner = false;
        room.roomState = 'round_ended';
        
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
            broadcastRoomState(roomId);
          }
        }, 3000);
        return;
      }
    }

    room.turnIndex = getNextTurnIndex(room);
    broadcastRoomState(roomId);
  });

  socket.on('guess-word', ({ roomId, word }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.roomState !== 'round_active') return;
    
    const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
    if (playerIndex === -1) return;
    if (playerIndex !== room.turnIndex) return;
    if (playerIndex === room.hostIndex) return;

    const upperWord = word.toUpperCase().trim();
    if (!upperWord || room.wrongWords.includes(upperWord)) return;

    if (upperWord === room.word) {
      room.revealed = room.word.split('');
      room.gameOver = true;
      room.winner = true;
      room.roomState = 'round_ended';
      room.scores[socket.id] = (room.scores[socket.id] || 0) + 1;
      
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
          broadcastRoomState(roomId);
        }
      }, 3000);
      return;
    } else {
      room.wrongWords.push(upperWord);
      room.hollywoodIndex++;
      
      if (room.hollywoodIndex >= 9) {
        room.gameOver = true;
        room.winner = false;
        room.roomState = 'round_ended';
        
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
            broadcastRoomState(roomId);
          }
        }, 3000);
        return;
      }
    }

    room.turnIndex = getNextTurnIndex(room);
    broadcastRoomState(roomId);
  });

  socket.on('chat-message', ({ roomId, message }) => {
    const room = rooms[roomId];
    if (!room) return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    const chatMsg = {
      socketId: socket.id,
      name: player.username,
      message: message,
      timestamp: Date.now()
    };
    room.messages.push(chatMsg);
    io.to(roomId).emit('chat-message', chatMsg);
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
      
      if (playerIndex > -1) {
        room.players.splice(playerIndex, 1);
        delete room.scores[socket.id];
        
        if (room.players.length === 0) {
          delete rooms[roomId];
        } else {
          if (playerIndex < room.hostIndex) {
            room.hostIndex--;
          } else if (playerIndex === room.hostIndex) {
            room.hostIndex = room.hostIndex % room.players.length;
          }
          
          if (room.turnIndex !== null) {
            if (playerIndex < room.turnIndex) {
              room.turnIndex--;
            } else if (playerIndex === room.turnIndex) {
              room.turnIndex = room.turnIndex % room.players.length;
              if (room.turnIndex === room.hostIndex) {
                room.turnIndex = getNextTurnIndex(room);
              }
            }
          }
          
          room.roomState = 'waiting_for_host_input';
          room.word = '';
          room.clues = [];
          room.revealed = [];
          room.gameOver = false;
          room.turnIndex = null;
          
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
