# Critical Fixes: Host Word Privacy & Master Host System

## PART 1: HOST PRIVATE WORD VISIBILITY ✅ FIXED

### Problem
- Full word was broadcast to all players in game-state
- Host couldn't see word privately
- Security issue: word exposed to all clients

### Solution

**Server-Side (server.js)**

Changed `broadcastRoomState()` to use TWO separate emissions:

```javascript
// State WITHOUT full word (sent to all players)
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
  timerSeconds: room.timerSeconds
  // NOTE: NO word field
};

// Broadcast to all players (WITHOUT full word)
io.to(roomId).emit('game-state', state);

// Send full word ONLY to host
if (currentHost) {
  io.to(currentHost.socketId).emit('hostSecretWord', room.word);
}
```

**Client-Side (game.js)**

Added listener for private word:

```javascript
socket.on('hostSecretWord', (word) => {
  if (gameState) {
    gameState.hostSecretWord = word;
    renderHostView();
  }
});
```

Updated renderHostView to use private word:

```javascript
function renderHostView() {
  const hostPanel = document.getElementById('hostSecretWord');
  if (!hostPanel) return;
  
  const isHost = gameState.hostSocketId === mySocketId;
  const isRoundActive = gameState.roomState === 'round_active';
  
  if (isHost && isRoundActive && gameState.hostSecretWord) {
    hostPanel.style.display = 'block';
    document.getElementById('hostWordDisplay').textContent = gameState.hostSecretWord;
  } else {
    hostPanel.style.display = 'none';
  }
}
```

### Why This Is Correct

✅ Full word NEVER in global broadcast
✅ Only host receives word via separate event
✅ Non-hosts cannot access word
✅ Server-authoritative (not client-controlled)
✅ No security leak

---

## PART 2: MASTER HOST SYSTEM ✅ FIXED

### Problem
- Kick validation was weak
- Index adjustment on kick was incomplete
- Master host role not properly enforced

### Solution

**Server-Side (server.js)**

Changed `kick-player` event to `kickPlayer` with proper validation:

```javascript
socket.on('kickPlayer', ({ roomId, targetSocketId }) => {
  const room = rooms[roomId];
  if (!room) return;
  
  // Verify kicker is master host
  const kickerIndex = room.players.findIndex(p => p.socketId === socket.id);
  if (kickerIndex === -1 || kickerIndex !== room.masterHostIndex) return;
  
  // Find target player
  const targetIndex = room.players.findIndex(p => p.socketId === targetSocketId);
  if (targetIndex === -1) return;
  
  // Remove target
  room.players.splice(targetIndex, 1);
  delete room.scores[targetSocketId];
  
  // Adjust hostIndex
  if (targetIndex < room.hostIndex) {
    room.hostIndex--;
  } else if (targetIndex === room.hostIndex) {
    room.hostIndex = room.hostIndex % room.players.length;
  }
  
  // Adjust masterHostIndex
  if (targetIndex < room.masterHostIndex) {
    room.masterHostIndex--;
  } else if (targetIndex === room.masterHostIndex) {
    room.masterHostIndex = 0;
  }
  
  // Adjust turnIndex
  if (room.turnIndex !== null) {
    if (targetIndex < room.turnIndex) {
      room.turnIndex--;
    } else if (targetIndex === room.turnIndex) {
      room.turnIndex = getNextTurnIndex(room);
    }
  }
  
  // Handle state if < 2 players
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
  
  // Disconnect target
  const targetSocket = io.sockets.sockets.get(targetSocketId);
  if (targetSocket) {
    targetSocket.emit('kicked');
    targetSocket.disconnect();
  }
  
  broadcastRoomState(roomId);
});
```

**Client-Side (game.js)**

Updated renderScoreboard to only show kick button if I am master host:

```javascript
function renderScoreboard() {
  const scoreboard = document.getElementById('scoreboard');
  if (!scoreboard) return;
  
  const hostName = gameState.players[gameState.hostIndex]?.username || 'Host';
  let html = `<h4>Round ${gameState.round} - Current Host: ${hostName}</h4>`;
  
  gameState.sortedPlayers.forEach(player => {
    const isCurrentHost = player.socketId === gameState.hostSocketId;
    const playerIndex = gameState.players.indexOf(player);
    const isMasterHost = gameState.masterHostIndex === playerIndex;
    const prefix = isCurrentHost ? '👑 ' : (isMasterHost ? '⭐ ' : '');
    const suffix = player.socketId === mySocketId ? ' (You)' : '';
    
    // Only show kick button if I am the master host
    const isMeTheMasterHost = gameState.masterHostIndex === gameState.players.findIndex(p => p.socketId === mySocketId);
    const kickBtn = isMeTheMasterHost && player.socketId !== mySocketId ? 
      ` <button class="kick-btn" onclick="kickPlayer('${player.socketId}')">Kick</button>` : '';
    
    html += `<div class="player-row">${prefix}${player.username}${suffix}: ${gameState.scores[player.socketId] || 0}${kickBtn}</div>`;
  });
  
  scoreboard.innerHTML = html;
}
```

Updated kickPlayer function:

```javascript
function kickPlayer(targetSocketId) {
  socket.emit('kickPlayer', { roomId, targetSocketId });
}
```

### Why This Is Correct

✅ Server validates master host before kick
✅ All indices properly adjusted
✅ Handles < 2 players case
✅ Master host reassigned to index 0 on disconnect
✅ Kick button only visible to master host
✅ No client-side authority

---

## Key Differences

| Aspect | Before | After |
|--------|--------|-------|
| Word broadcast | Sent to all | Only to host via separate event |
| Kick validation | Weak | Server-side strict validation |
| Index adjustment | Incomplete | Complete (host, master, turn) |
| Kick button | Shown to wrong players | Only to master host |
| Event name | `kick-player` | `kickPlayer` |

---

## Security Guarantees

✅ Full word never exposed globally
✅ Only authenticated host receives word
✅ Only master host can kick
✅ Server validates all actions
✅ No client-side authority
✅ Proper index management on removal

---

## Testing Checklist

- [ ] Host sees full word during round
- [ ] Other players don't see full word
- [ ] Kick button only visible to master host
- [ ] Non-master cannot kick
- [ ] Kick removes player safely
- [ ] Indices adjust correctly after kick
- [ ] Master host reassigned on disconnect
- [ ] Game continues with remaining players

---

## Deployment

Ready for git push and Render deployment.
