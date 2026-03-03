# HOLLYWOOD - Multiplayer Word Guessing Game

A real-time multiplayer word guessing game built with Node.js, Express, and Socket.io.

## Local Setup

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open browser and navigate to:
```
http://localhost:3000
```

## How to Play

1. Click "Create Room" to generate a new game room
2. Share the room link with other players
3. Host sets a secret word and optional clues
4. Players guess letters or the full word
5. Each wrong guess strikes a letter from HOLLYWOOD
6. Win by revealing the word before all 9 letters are struck

## Deployment to Render

1. Push code to GitHub repository

2. Create new Web Service on Render:
   - Connect your GitHub repository
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment: Node

3. Deploy and access via provided Render URL

## Tech Stack

- Backend: Node.js, Express, Socket.io
- Frontend: HTML, CSS, Vanilla JavaScript
- No database or authentication required
