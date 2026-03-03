# Host Visibility Loophole Fix

## Problem Statement

The round host could see the secret word but had no visibility into:
- What each player guessed
- Whether guesses were correct or wrong
- How many players remained to guess in the round

This created an asymmetric information problem where the host couldn't properly monitor game progress.

## Solution Architecture

### Server-Side Implementation

#### 1. Room State Tracking

Added two new fields to room state:

```javascript
roundGuesses: [],                    // Array of all guesses this round
playersWhoGuessedThisRound: new Set() // Set of socketIds who have guessed
```

#### 2. Guess Object Structure

Each guess is tracked with complete metadata:

```javascript
{
  playerName: "Arjun",
  guessType: "letter" | "word",
  value: "A" | "PYTHON",
  result: "correct_letter" | "wrong_letter" | "correct_word" | "wrong_word",
  timestamp: Date.now()
}
```

#### 3. Guess Tracking Logic

On every valid guess (letter or word):

```javascript
const playerName = room.players[playerIndex].username;
room.playersWhoGuessedThisRound.add(socket.id);

room.roundGuesses.push({
  playerName,
  guessType: 'letter',
  value: upperLetter,
  result: 'correct_letter',  // or wrong_letter, correct_word, wrong_word
  timestamp: Date.now()
});
```

#### 4. Remaining Guessers Calculation

```javascript
const totalEligiblePlayers = room.players.length - 1;  // Exclude host
const remainingGuessers = totalEligiblePlayers - room.playersWhoGuessedThisRound.size;
```

#### 5. Host-Only Broadcast

In `broadcastRoomState()`, after sending global game state:

```javascript
// Send round guess log ONLY to host
if (currentHost && room.roomState === 'round_active') {
  const totalEligiblePlayers = room.players.length - 1;
  const remainingGuessers = totalEligiblePlayers - room.playersWhoGuessedThisRound.size;
  io.to(currentHost.socketId).emit('hostRoundUpdate', {
    roundGuesses: room.roundGuesses,
    remainingGuessers: remainingGuessers
  });
}
```

**Key Security Point**: This event is sent ONLY to the host's socket via `io.to(currentHost.socketId)`. Non-hosts never receive this data.

#### 6. Round Reset

When a round ends (win/loss), clear tracking:

```javascript
room.roundGuesses = [];
room.playersWhoGuessedThisRound = new Set();
```

### Client-Side Implementation

#### 1. Event Listener

```javascript
socket.on('hostRoundUpdate', (data) => {
  if (gameState) {
    gameState.roundGuesses = data.roundGuesses;
    gameState.remainingGuessers = data.remainingGuessers;
    renderHostRoundLog();
  }
});
```

#### 2. Host-Only Rendering

```javascript
function renderHostRoundLog() {
  const logPanel = document.getElementById('hostRoundLog');
  if (!logPanel) return;
  
  const isHost = gameState.hostSocketId === mySocketId;
  const isRoundActive = gameState.roomState === 'round_active';
  
  if (isHost && isRoundActive && gameState.roundGuesses) {
    logPanel.style.display = 'block';
    
    // Display remaining guessers
    const remainingDiv = document.getElementById('hostRemainingGuessers');
    if (remainingDiv) {
      remainingDiv.textContent = `Remaining players to guess: ${gameState.remainingGuessers}`;
    }
    
    // Display guess log
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
```

**Key Security Point**: The panel only renders if `isHost && isRoundActive`. Non-hosts never see this UI.

## Security Guarantees

### 1. No Information Leakage to Non-Hosts

- `hostRoundUpdate` event is sent ONLY via `io.to(currentHost.socketId)`
- Non-host sockets never receive this event
- Even if a non-host player inspects network traffic, they cannot access the event (Socket.io enforces room-based delivery)

### 2. No Client-Side Authority

- Guess log is computed server-side
- Client cannot modify or forge guess data
- Client cannot request guess log (no event handler for client requests)

### 3. Guess Result Accuracy

- All guess validation happens server-side
- Result type is determined by server logic, not client
- Client only displays what server sends

### 4. Player Tracking Integrity

- `playersWhoGuessedThisRound` is a server-side Set
- Only updated when server validates a valid guess
- Cannot be manipulated by client

### 5. Remaining Guessers Accuracy

- Calculated server-side: `totalEligiblePlayers - playersWhoGuessedThisRound.size`
- Excludes host automatically (host never guesses)
- Updated on every valid guess

## Data Flow

```
Player makes guess
    ↓
Server validates (guess-letter or guess-word event)
    ↓
Server adds to roundGuesses array
    ↓
Server adds to playersWhoGuessedThisRound Set
    ↓
Server calls broadcastRoomState()
    ↓
Global game-state sent to ALL players (no guess log)
    ↓
hostRoundUpdate sent ONLY to host socket
    ↓
Host client receives and renders guess log
    ↓
Non-host clients never receive hostRoundUpdate
```

## Edge Cases Handled

### 1. Host Disconnects
- Round state is preserved
- If new host takes over, they receive fresh `hostRoundUpdate` on next broadcast
- Old guess log is cleared on round end

### 2. Player Joins Mid-Round
- New player doesn't receive guess log (not in host socket)
- New player can still guess (added to `playersWhoGuessedThisRound` on first guess)

### 3. Player Kicked Mid-Round
- Removed from `playersWhoGuessedThisRound` if they hadn't guessed
- Remaining guessers count updates automatically
- Guess log preserved (shows their previous guesses if any)

### 4. Multiple Guesses by Same Player
- Player can only guess once per turn
- Turn rotation prevents multiple guesses in same round
- Each guess is tracked separately in log

### 5. Round Ends
- `roundGuesses` cleared
- `playersWhoGuessedThisRound` cleared
- Host no longer sees guess log (roomState changes to 'waiting_for_host_input')

## Testing Checklist

- [ ] Host sees secret word during round
- [ ] Host sees all guesses in real-time
- [ ] Host sees correct/wrong result for each guess
- [ ] Host sees remaining players count
- [ ] Non-host players cannot see guess log
- [ ] Non-host players cannot see secret word
- [ ] Guess log clears on round end
- [ ] Remaining count updates after each guess
- [ ] Works with 2+ players
- [ ] Works after player disconnect
- [ ] Works after player kick
- [ ] HTML escaping prevents XSS in player names/guesses

## Performance Considerations

- `roundGuesses` array grows linearly with guesses (max ~50-100 per round)
- `playersWhoGuessedThisRound` Set is O(1) lookup
- `hostRoundUpdate` sent only to host (not broadcast to all)
- No database queries (all in-memory)
- Minimal network overhead (one targeted emit per guess)

## Backward Compatibility

- Existing game logic unchanged
- Turn rotation unchanged
- Scoring unchanged
- Chat system unchanged
- Master host system unchanged
- Only adds new server-side tracking and host-only event

## Future Enhancements

1. **Guess Statistics**: Track accuracy % per player
2. **Guess Timing**: Show how long each guess took
3. **Guess Patterns**: Highlight common wrong guesses
4. **Replay**: Allow host to review guess log after round
5. **Export**: Download round transcript as CSV
