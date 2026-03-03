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
        winner: false
      };
      socket.emit('is-host', true);
    } else {
      socket.emit('is-host', false);
      if (rooms[roomId].gameStarted) {
        socket.emit('game-state', rooms[roomId]);
      }
    }
  });

  socket.on('start-game', ({ roomId, word, clues }) => {
    const room = rooms[roomId];
    if (!room || room.hostSocketId !== socket.id) return;

    room.word = word.toUpperCase();
    room.clues = clues.filter(c => c.trim());
    room.revealed = Array(word.length).fill('_');
    room.gameStarted = true;

    io.to(roomId).emit('game-state', room);
  });

  socket.on('guess-letter', ({ roomId, letter }) => {
    const room = rooms[roomId];
    if (!room || !room.gameStarted || room.gameOver) return;

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
    if (!room || !room.gameStarted || room.gameOver) return;

    const upperWord = word.toUpperCase().trim();
    
    if (!upperWord || room.wrongWords.includes(upperWord)) return;

    if (upperWord === room.word) {
      room.revealed = room.word.split('');
      room.gameOver = true;
      room.winner = true;
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
      if (rooms[roomId].hostSocketId === socket.id) {
        delete rooms[roomId];
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
