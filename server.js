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

function getNextHost(room) {
  const currentIndex = room.players.indexOf(room.hostSocketId);
  const nextIndex = (currentIndex + 1) % room.players.length;
  return room.players[nextIndex];
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

io.on('connection', (socket) => {
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    
    if (!rooms[roomId]) {
      rooms[roomId] = {
        word: null,
        clues: [],
        revealed: [],
        correctLetters: [],
        wrongLetters: [],
        wrongWords: [],
        hollywoodIndex: 0,
        gameOver: false,
        gameStarted: false,
        hostSocketId: socket.id,
        winner: false,
        players: [socket.id],
        playerNames: {},
        scores: {},
        round: 1,
        messages: [],
        playersHosted: [socket.id],
        nextHostId: null
      };
      socket.emit('is-host', true);
      socket.emit('need-name', true);
    } else {
      if (!rooms[roomId].players.includes(socket.id)) {
        rooms[roomId].players.push(socket.id);
      }
      socket.emit('is-host', socket.id === rooms[roomId].hostSocketId);
      socket.emit('need-name', !rooms[roomId].playerNames[socket.id]);
      if (rooms[roomId].playerNames[socket.id]) {
        socket.emit('game-state', rooms[roomId]);
      }
    }
  });

  socket.on('set-name', ({ roomId, name }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.playerNames[socket.id] = name;
    room.scores[socket.id] = room.scores[socket.id] || 0;
    io.to(roomId).emit('game-state', room);
  });

  socket.on('start-game', ({ roomId, word, clues }) => {
    const room = rooms[roomId];
    if (!room || room.hostSocketId !== socket.id) return;

    room.word = word.toUpperCase();
    room.clues = clues.filter(c => c.trim());
    room.revealed = Array(word.length).fill('_');
    room.gameStarted = true;
    room.gameOver = false;
    room.winner = false;
    room.correctLetters = [];
    room.wrongLetters = [];
    room.wrongWords = [];
    room.hollywoodIndex = 0;

    io.to(roomId).emit('game-state', room);
  });

  socket.on('next-round', (roomId) => {
    const room = rooms[roomId];
    if (!room) return;

    const currentIndex = room.players.indexOf(room.hostSocketId);
    let nextIndex = (currentIndex + 1) % room.players.length;
    let nextHost = room.players[nextIndex];
    
    while (room.playersHosted.includes(nextHost) && room.playersHosted.length < room.players.length) {
      nextIndex = (nextIndex + 1) % room.players.length;
      nextHost = room.players[nextIndex];
    }
    
    if (!room.playersHosted.includes(nextHost)) {
      room.playersHosted.push(nextHost);
    }
    
    room.hostSocketId = nextHost;
    room.round++;
    room.word = null;
    room.clues = [];
    room.revealed = [];
    room.correctLetters = [];
    room.wrongLetters = [];
    room.wrongWords = [];
    room.hollywoodIndex = 0;
    room.gameOver = false;
    room.gameStarted = false;
    room.winner = false;
    
    const nextIndex2 = (room.players.indexOf(nextHost) + 1) % room.players.length;
    room.nextHostId = room.players[nextIndex2];

    io.to(roomId).emit('game-state', room);
    room.players.forEach(playerId => {
      io.to(playerId).emit('is-host', playerId === nextHost);
    });
  });

  socket.on('chat-message', ({ roomId, message }) => {
    const room = rooms[roomId];
    if (!room) return;

    const chatMsg = {
      socketId: socket.id,
      name: room.playerNames[socket.id] || 'Unknown',
      message: message,
      timestamp: Date.now()
    };
    room.messages.push(chatMsg);
    io.to(roomId).emit('chat-message', chatMsg);
  });

  socket.on('guess-letter', ({ roomId, letter }) => {
    const room = rooms[roomId];
    if (!room || !room.gameStarted || room.gameOver || socket.id === room.hostSocketId) return;

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
        room.scores[socket.id] = (room.scores[socket.id] || 0) + 1;
      }
    } else {
      room.wrongLetters.push(upperLetter);
      room.hollywoodIndex++;
      
      if (room.hollywoodIndex >= 9) {
        room.gameOver = true;
        room.winner = false;
      }
    }

    io.to(roomId).emit('game-state', room);
  });

  socket.on('guess-word', ({ roomId, word }) => {
    const room = rooms[roomId];
    if (!room || !room.gameStarted || room.gameOver || socket.id === room.hostSocketId) return;

    const upperWord = word.toUpperCase().trim();
    
    if (!upperWord || room.wrongWords.includes(upperWord)) return;

    if (upperWord === room.word) {
      room.revealed = room.word.split('');
      room.gameOver = true;
      room.winner = true;
      room.scores[socket.id] = (room.scores[socket.id] || 0) + 1;
    } else {
      room.wrongWords.push(upperWord);
      room.hollywoodIndex++;
      
      if (room.hollywoodIndex >= 9) {
        room.gameOver = true;
        room.winner = false;
      }
    }

    io.to(roomId).emit('game-state', room);
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const index = room.players.indexOf(socket.id);
      if (index > -1) {
        room.players.splice(index, 1);
        delete room.scores[socket.id];
        
        if (room.players.length === 0) {
          delete rooms[roomId];
        } else if (room.hostSocketId === socket.id) {
          room.hostSocketId = room.players[0];
          io.to(room.hostSocketId).emit('is-host', true);
          io.to(roomId).emit('game-state', room);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
