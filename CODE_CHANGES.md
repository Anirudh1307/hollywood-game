# Exact Code Changes

## File: server.js

### Change 1: Add Helper Functions (After line 12)

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

**Location:** Lines 15-20

---

### Change 2: Update Word Initialization (In `start-game` handler)

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

**Location:** Lines 103-110

**Why:** Uses helper function for consistency and clarity.

---

### Change 3: Add Comment to Letter Validation (In `guess-letter` handler)

**Before:**
```javascript
if (!/^[A-Z0-9]$/.test(upperLetter)) return;
```

**After:**
```javascript
// Reject non-alphanumeric guesses
if (!/^[A-Z0-9]$/.test(upperLetter)) return;
```

**Location:** Line 149

**Why:** Clarifies intent. Regex already correct.

---

### Change 4: Update Full-Word Guess Validation (In `guess-word` handler)

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

**Location:** Lines 189-200

**Why:** Compares normalized versions to handle spacing/punctuation variants.

---

### Change 5: Store Normalized Guess (In `guess-word` handler, wrong word branch)

**Before:**
```javascript
room.wrongWords.push(upperWord);
```

**After:**
```javascript
room.wrongWords.push(normalizedGuess);
```

**Location:** Line 211

**Why:** Prevents duplicate guesses with different spacing.

---

## File: game.js

### Change 1: Add Comment to Keypad (In `renderKeypad` function)

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

**Location:** Lines 234-237

**Why:** Clarifies behavior. Keypad already only shows A-Z and 0-9.

---

## Summary of Changes

| File | Lines | Type | Purpose |
|------|-------|------|---------|
| server.js | 15-20 | Add | Helper functions |
| server.js | 103-110 | Update | Word initialization |
| server.js | 149 | Add | Comment on letter validation |
| server.js | 189-200 | Update | Full-word guess validation |
| server.js | 211 | Update | Store normalized guess |
| game.js | 234-237 | Add | Comment on keypad |

**Total Lines Changed:** ~30 lines
**Total Lines Added:** ~15 lines
**Breaking Changes:** None
**Backward Compatible:** Yes

---

## Validation Regex Reference

```javascript
// Letter guess validation
/^[A-Z0-9]$/

// Alphanumeric check
/[A-Z0-9]/

// Used in word initialization and comparison
```

---

## Testing Commands

```bash
# Start server
npm start

# Test with spaces
# Set word: "HELLO WORLD"
# Expected: H _ L L O   W O R L D

# Test with punctuation
# Set word: "DON'T"
# Expected: D O N ' T

# Test with numbers
# Set word: "2024"
# Expected: _ _ _ _

# Test full-word guess variants
# Secret: "HELLO WORLD"
# Guess: "HELLOWORLD" → Should match
# Guess: "HELLO  WORLD" → Should match
```
