# Tâb Game

Traditional Middle Eastern board game with online multiplayer support.

## Features

- Online multiplayer mode (via server matching)
- Local AI mode with adjustable difficulty
- Modern glassmorphism UI design
- Real-time updates via Server-Sent Events (SSE)

## Getting Started

### Start the backend server

```bash
cd server
npm install
npm start
# Server runs at http://localhost:8008
```

### Start the frontend

```bash
# Use any static file server, e.g.:
python -m http.server 3000
# Visit http://localhost:3000
```

## Tech Stack

- Frontend: Vanilla JavaScript (ES6 Modules), HTML5 Canvas
- Backend: Node.js, Express
- Real-time: Server-Sent Events (SSE)
- Security: SHA-256 password hashing
