# HOLLYWOOD Game - Non-Alphanumeric Character Refactor

## Overview
Refactored the game logic to properly handle non-alphanumeric characters (spaces, punctuation, symbols) in secret words. These characters are now automatically revealed at round start and are never guessable.

---

## Changes Made

### 1. Server-Side Helper Functions (server.js, lines 15-20)

```javascript
// Helper: Check if character is alphanumeric
function isAlphanumeric(char) {
  return /[A-Z0-9]/.test(char);
}

// Helper: Normalize word by removing non-alphanumeric for comparison
function normalizeForComparison(word) {
  return word.toUpperCase().split('').filter(isAlphanumeric).join('');
}
```

**Purpose:**
- `isAlphanumeric()`: Centralized validation for guessable characters
- `normalizeForComparison()`: Strips non-alphanumeric chars for full-word guess comparison

---

### 2. Word Initialization (server.js, lines 103-110)

**Before:**
```javascript
room.revealed = [];
for (let i = 0; i < room.word.length; i++) {
  const char = room.word[i];
  if (/[A-Z0-9]/.test(char)) {
    room.revealed.push('_');
  } else {
    room.revealed.push(char);
  }
}
```

**After:**
```javascript
// Initialize revealed: non-alphanumeric chars visible, alphanumeric hidden
room.revealed = [];
for (let i = 0; i < room.word.length; i++) {
  const char = room.word[i];
  room.revealed.push(isAlphanumeric(char) ? '_' : char);
}
```

**Why:** Uses helper function for consistency and clarity. Non-alphanumeric characters are immediately visible.

**Example:**
- Word: `"HELLO WORLD"` → Display: `H _ L L O   W O R L D` (space visible)
- Word: `"AI-2026!"` → Display: `_ _ - 2 0 2 6 !` (hyphen and exclamation visible)

---

### 3. Letter Guess Validation (server.js, line 149)

**Before:**
```javascript
if (!/^[A-Z0-9]$/.test(upperLetter)) return;
```

**After:**
```javascript
// Reject non-alphanumeric guesses
if (!/^[A-Z0-9]$/.test(upperLetter)) return;
```

**Why:** Added clarifying comment. Regex already correctly rejects spaces, symbols, and multiple characters.

---

### 4. Full-Word Guess Validation (server.js, lines 189-200)

**Before:**
```javascript
const upperWord = word.toUpperCase().trim();
if (!upperWord || room.wrongWords.includes(upperWord)) return;

if (upperWord === room.word) {
```

**After:**
```javascript
const upperWord = word.toUpperCase().trim();
if (!upperWord) return;

// Normalize both for comparison (remove non-alphanumeric)
const normalizedGuess = normalizeForComparison(upperWord);
const normalizedSecret = normalizeForComparison(room.word);

// Check if this exact guess was already tried
if (room.wrongWords.includes(normalizedGuess)) return;

if (normalizedGuess === normalizedSecret) {
```

**Why:** 
- Compares normalized versions (alphanumeric only)
- Prevents duplicate guesses by storing normalized form
- Allows players to guess "HELLO WORLD" or "HELLOWORLD" as equivalent

**Example:**
- Secret: `"AI-2026!"`
- Guess: `"AI 2026"` → Normalized: `"AI2026"` → Stored: `"AI2026"` → Match!

---

### 5. Wrong Word Storage (server.js, line 211)

**Before:**
```javascript
room.wrongWords.push(upperWord);
```

**After:**
```javascript
room.wrongWords.push(normalizedGuess);
```

**Why:** Stores normalized form to prevent duplicate guesses with different spacing/punctuation.

---

### 6. Client-Side Keypad (game.js, lines 234-237)

**Before:**
```javascript
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const isHost = gameState.hostSocketId === mySocketId;
const isMyTurn = gameState.turnSocketId === mySocketId;
```

**After:**
```javascript
// Only alphanumeric characters are guessable
// Non-alphanumeric chars (spaces, symbols) are auto-revealed and never guessable
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const isHost = gameState.hostSocketId === mySocketId;
const isMyTurn = gameState.turnSocketId === mySocketId;
```

**Why:** Added clarifying comments. Keypad already only shows A-Z and 0-9.

---

## Validation Rules Summary

### Letter Guess
- **Accept:** Single alphanumeric character (`/^[A-Z0-9]$/`)
- **Reject:** Spaces, symbols, multiple characters, empty string
- **Server:** Validates before processing

### Full-Word Guess
- **Accept:** Any string containing alphanumeric + non-alphanumeric
- **Process:** Normalize both guess and secret (remove non-alphanumeric)
- **Compare:** Exact match on normalized forms
- **Example:** `"HELLO WORLD"` == `"HELLOWORLD"` (both normalize to `"HELLOWORLD"`)

### Non-Alphanumeric Characters
- **Auto-revealed:** Visible from round start
- **Never guessable:** Cannot be selected on keypad
- **Never penalized:** Wrong guesses don't affect HOLLYWOOD lives
- **Always displayed:** Shown as-is in word state

---

## Server Memory Example

**Word:** `"AI-2026!"`

**Initial State:**
```javascript
word = "AI-2026!"
revealed = ["_", "_", "-", "2", "0", "2", "6", "!"]
correctLetters = []
wrongLetters = []
wrongWords = []
```

**After Guess 'A':**
```javascript
revealed = ["A", "_", "-", "2", "0", "2", "6", "!"]
correctLetters = ["A"]
```

**After Wrong Guess 'X':**
```javascript
wrongLetters = ["X"]
hollywoodIndex = 1
```

**After Full-Word Guess "AI 2026":**
```javascript
normalizedGuess = "AI2026"
normalizedSecret = "AI2026"
// Match! Game won
```

---

## Security & Edge Cases

✅ **Handled:**
- Empty guesses rejected
- Duplicate guesses rejected
- Non-alphanumeric guesses rejected
- Spaces in full-word guesses normalized
- Multiple punctuation variants treated as same guess
- Host cannot guess
- Only current player can guess

✅ **No Changes to:**
- Turn system
- Host rotation
- Score tracking
- Chat functionality
- Disconnect handling

---

## Testing Checklist

- [ ] Word with spaces: `"HELLO WORLD"` → Space visible immediately
- [ ] Word with punctuation: `"DON'T"` → Apostrophe visible immediately
- [ ] Word with numbers: `"2024"` → Numbers guessable like letters
- [ ] Word with symbols: `"$100"` → Dollar sign visible, numbers guessable
- [ ] Full-word guess with extra spaces: `"HELLO  WORLD"` → Matches `"HELLO WORLD"`
- [ ] Full-word guess without spaces: `"HELLOWORLD"` → Matches `"HELLO WORLD"`
- [ ] Letter guess of space: Rejected by server
- [ ] Letter guess of symbol: Rejected by server
- [ ] Duplicate full-word guess: Rejected by server

---

## Why Non-Alphanumeric Characters Are Auto-Revealed

1. **Game Balance:** Prevents players from wasting guesses on punctuation
2. **Clarity:** Players see word structure immediately (e.g., "HELLO WORLD" vs "HELLOWORLD")
3. **Fairness:** No advantage to guessing spaces/symbols
4. **Simplicity:** Reduces complexity of guess validation
5. **UX:** Keypad only shows guessable characters (A-Z, 0-9)
