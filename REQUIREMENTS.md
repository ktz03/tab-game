# Tab Game - Requirements Document

## Project Overview

Transform the Tab board game into a distributed online battle system, allowing players on different computers to compete.

## Server Address

- Original server: `http://twserver.alunos.dcc.fc.up.pt:8008/`
- Local development server: `http://localhost:8008/`

---

## API Interface Specification

### General Rules

- Except for `update`, all requests use `POST` method with JSON data format
- `update` uses `GET` method + Server-Sent Events (SSE)
- All responses are in JSON format

---

### 1. register - User Registration/Login

**URL:** `/register`  
**Method:** POST  
**Request Body:**
```json
{
  "nick": "string",
  "password": "string"
}
```

### 2. join - Join/Create Game

**URL:** `/join`  
**Method:** POST  
**Request Body:**
```json
{
  "group": 99,
  "nick": "string",
  "password": "string",
  "size": 9
}
```

### 3. leave - Leave/Forfeit Game

**URL:** `/leave`  
**Method:** POST

### 4. roll - Roll Dice

**URL:** `/roll`  
**Method:** POST

### 5. pass - Skip Turn

**URL:** `/pass`  
**Method:** POST

### 6. notify - Notify Move

**URL:** `/notify`  
**Method:** POST

### 7. update - Real-time Update (SSE)

**URL:** `/update?nick={nick}&game={game}`  
**Method:** GET (Server-Sent Events)

### 8. ranking - Leaderboard

**URL:** `/ranking`  
**Method:** POST

---

## Data Structures

### pieces Array

- Length: `4 * size`
- Each element is `null` or:
```json
{
  "color": "Blue",
  "inMotion": true,
  "reachedLastRow": false
}
```

### dice Object

```json
{
  "stickValues": [false, true, false, false],
  "value": 1,
  "keepPlaying": true
}
```

### Dice Value Reference

| Light Count | Value | Name | Can Re-roll | Probability |
|-------------|-------|------|-------------|-------------|
| 0 | 6 | Sitteh | Yes | 6% |
| 1 | 1 | Tab | Yes | 25% |
| 2 | 2 | Itneyn | No | 38% |
| 3 | 3 | Telateh | No | 25% |
| 4 | 4 | Arba'ah | Yes | 6% |

---

## File Structure

```
tab-game/
├── index.html
├── style.css
├── app.js
├── server-api.js
└── server/
    ├── server.js
    ├── package.json
    └── data/
        ├── users.json
        └── rankings.json
```

---

## Node.js Server Features

### Implemented Features

1. **Request Handling** - Express routes for all 8 API endpoints
2. **Response Format** - All responses use JSON format
3. **Code Structure** - Modular design with clear function separation
4. **Data Persistence** - User data and leaderboard saved to JSON files
5. **Hash Encryption** - SHA-256 encryption for user passwords

### Security Features

- Passwords encrypted using `crypto.createHash('sha256')`
- Hash values compared during verification, no plaintext storage
- Game IDs generated using `crypto.randomBytes()`

### Data Persistence

- User data: `server/data/users.json`
- Leaderboard data: `server/data/rankings.json`
- Data persists after server restart