// ============================================
// T芒b Game - Main Application
// ============================================

import { ServerAPI, SessionManager } from './server-api.js';

// ============================================
// Configura莽茫o do Jogo
// ============================================
const CONFIG = {
  // Servidor do curso (requer rede do campus): 'http://twserver.alunos.dcc.fc.up.pt:8008'
  // Servidor local: 'http://localhost:8008'
  SERVER_URL: 'http://localhost:8008',
  GROUP_ID: 99,  // ID do grupo padr茫o, pode ser alterado na interface
  CELL_SIZE: 60,
  PIECE_RADIUS: 22,
  ANIMATION_DURATION: 300,
  COLORS: {
    board: '#2d1810',
    cell: '#d4a574',
    cellAlt: '#c49464',
    cellHighlight: 'rgba(255, 215, 0, 0.4)',
    cellValid: 'rgba(76, 175, 80, 0.4)',
    blue: '#4a9eff',
    red: '#ff4a4a',
    blueShadow: 'rgba(74, 158, 255, 0.5)',
    redShadow: 'rgba(255, 74, 74, 0.5)'
  }
};

// ============================================
// Classe de Estado do Jogo
// ============================================
class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    this.boardSize = 9;
    this.pieces = [];  // Array do tabuleiro no formato do servidor
    this.gameId = null;
    this.myNick = null;
    this.myColor = null;
    this.opponentNick = null;
    this.turn = null;
    this.step = 'from';  // 'from' ou 'to'
    this.dice = null;
    this.selected = [];
    this.winner = null;
    this.isOnline = false;
    this.isStarted = false;
    this.isOver = false;
    this.mustPass = null;
  }

  // Converter o array pieces do servidor para tabuleiro 2D
  get board() {
    const board = Array(4).fill(null).map(() => Array(this.boardSize).fill(null));
    if (!this.pieces) return board;
    
    for (let i = 0; i < this.pieces.length; i++) {
      const piece = this.pieces[i];
      if (piece) {
        const row = Math.floor(i / this.boardSize);
        const col = i % this.boardSize;
        board[row][col] = piece;
      }
    }
    return board;
  }

  // Converter row, col para 铆ndice do array pieces
  toIndex(row, col) {
    return row * this.boardSize + col;
  }

  // Converter 铆ndice para row, col
  fromIndex(index) {
    return {
      row: Math.floor(index / this.boardSize),
      col: index % this.boardSize
    };
  }

  isMyTurn() {
    return this.turn === this.myNick;
  }

  getPieceCount(color) {
    if (!this.pieces) return 0;
    return this.pieces.filter(p => p && p.color === color).length;
  }
}

// ============================================
// Renderizador Canvas
// ============================================
class GameRenderer {
  constructor(canvas, state) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = state;
    this.animatingPieces = new Map();  // Pe莽as em anima莽茫o
    this.hoveredCell = null;
    this.validMoves = [];
  }

  // Verificar se precisa inverter a perspetiva (jogador vermelho v锚 o tabuleiro invertido)
  shouldFlip() {
    return this.state.myColor === 'Red';
  }

  // Converter coordenadas l贸gicas para coordenadas de exibi莽茫o
  toDisplayCoords(row, col) {
    if (this.shouldFlip()) {
      return {
        displayRow: 3 - row,
        displayCol: this.state.boardSize - 1 - col
      };
    }
    return { displayRow: row, displayCol: col };
  }

  // Converter coordenadas de exibi莽茫o para coordenadas l贸gicas
  fromDisplayCoords(displayRow, displayCol) {
    if (this.shouldFlip()) {
      return {
        row: 3 - displayRow,
        col: this.state.boardSize - 1 - displayCol
      };
    }
    return { row: displayRow, col: displayCol };
  }

  resize() {
    const size = this.state.boardSize;
    const width = size * CONFIG.CELL_SIZE + 40;
    const height = 4 * CONFIG.CELL_SIZE + 40;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawBoard();
    this.drawPieces();
    this.drawHighlights();
  }

  drawBoard() {
    const ctx = this.ctx;
    const size = this.state.boardSize;
    const cellSize = CONFIG.CELL_SIZE;
    const offsetX = 20;
    const offsetY = 20;

    // Fundo do tabuleiro
    ctx.fillStyle = CONFIG.COLORS.board;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Desenhar c茅lulas
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < size; col++) {
        const x = offsetX + col * cellSize;
        const y = offsetY + (3 - row) * cellSize;  // Inverter eixo Y para exibi莽茫o
        
        // Cores alternadas
        ctx.fillStyle = (row + col) % 2 === 0 ? CONFIG.COLORS.cell : CONFIG.COLORS.cellAlt;
        ctx.fillRect(x, y, cellSize, cellSize);
        
        // Borda da c茅lula
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, cellSize, cellSize);
      }
    }

    // Desenhar n煤meros das linhas (ajustado conforme perspetiva)
    ctx.fillStyle = '#888';
    ctx.font = '12px Arial';
    for (let displayRow = 0; displayRow < 4; displayRow++) {
      const { row } = this.fromDisplayCoords(displayRow, 0);
      const y = offsetY + (3 - displayRow) * cellSize + cellSize / 2 + 4;
      ctx.fillText(row.toString(), 5, y);
    }
  }

  drawPieces() {
    const board = this.state.board;
    const cellSize = CONFIG.CELL_SIZE;
    const offsetX = 20;
    const offsetY = 20;

    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < this.state.boardSize; col++) {
        const piece = board[row][col];
        if (!piece) continue;

        // Converter para coordenadas de exibi莽茫o
        const { displayRow, displayCol } = this.toDisplayCoords(row, col);

        // Verificar se h谩 anima莽茫o
        const animKey = `${row}-${col}`;
        const anim = this.animatingPieces.get(animKey);
        
        let x, y;
        if (anim) {
          x = anim.currentX;
          y = anim.currentY;
        } else {
          x = offsetX + displayCol * cellSize + cellSize / 2;
          y = offsetY + (3 - displayRow) * cellSize + cellSize / 2;
        }

        this.drawPiece(x, y, piece);
      }
    }
  }

  drawPiece(x, y, piece) {
    const ctx = this.ctx;
    const radius = CONFIG.PIECE_RADIUS;
    const isBlue = piece.color === 'Blue';
    const color = isBlue ? CONFIG.COLORS.blue : CONFIG.COLORS.red;
    const shadow = isBlue ? CONFIG.COLORS.blueShadow : CONFIG.COLORS.redShadow;

    // Sombra
    ctx.beginPath();
    ctx.arc(x + 3, y + 3, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fill();

    // Corpo principal
    const gradient = ctx.createRadialGradient(x - 5, y - 5, 0, x, y, radius);
    gradient.addColorStop(0, isBlue ? '#7ac4ff' : '#ff7a7a');
    gradient.addColorStop(1, color);
    
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Borda
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Indicador de estado
    if (piece.inMotion) {
      ctx.beginPath();
      ctx.arc(x, y, radius - 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fill();
    }

    if (piece.reachedLastRow) {
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('鈽?, x, y);
    }
  }

  drawHighlights() {
    const ctx = this.ctx;
    const cellSize = CONFIG.CELL_SIZE;
    const offsetX = 20;
    const offsetY = 20;

    // Destacar c茅lulas selecionadas
    for (const index of this.state.selected) {
      const { row, col } = this.state.fromIndex(index);
      const { displayRow, displayCol } = this.toDisplayCoords(row, col);
      const x = offsetX + displayCol * cellSize;
      const y = offsetY + (3 - displayRow) * cellSize;
      
      ctx.fillStyle = CONFIG.COLORS.cellHighlight;
      ctx.fillRect(x, y, cellSize, cellSize);
      
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
    }

    // Destacar movimentos v谩lidos
    for (const index of this.validMoves) {
      const { row, col } = this.state.fromIndex(index);
      const { displayRow, displayCol } = this.toDisplayCoords(row, col);
      const x = offsetX + displayCol * cellSize;
      const y = offsetY + (3 - displayRow) * cellSize;
      
      ctx.fillStyle = CONFIG.COLORS.cellValid;
      ctx.fillRect(x, y, cellSize, cellSize);
    }

    // Destacar c茅lula sob o cursor
    if (this.hoveredCell !== null) {
      const { row, col } = this.state.fromIndex(this.hoveredCell);
      const { displayRow, displayCol } = this.toDisplayCoords(row, col);
      const x = offsetX + displayCol * cellSize;
      const y = offsetY + (3 - displayRow) * cellSize;
      
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
    }
  }

  // Anima莽茫o de deslizamento da pe莽a (considerando invers茫o de perspetiva)
  animateMove(fromIndex, toIndex, callback) {
    const from = this.state.fromIndex(fromIndex);
    const to = this.state.fromIndex(toIndex);
    const cellSize = CONFIG.CELL_SIZE;
    const offsetX = 20;
    const offsetY = 20;

    // Converter para coordenadas de exibi莽茫o
    const fromDisplay = this.toDisplayCoords(from.row, from.col);
    const toDisplay = this.toDisplayCoords(to.row, to.col);

    const startX = offsetX + fromDisplay.displayCol * cellSize + cellSize / 2;
    const startY = offsetY + (3 - fromDisplay.displayRow) * cellSize + cellSize / 2;
    const endX = offsetX + toDisplay.displayCol * cellSize + cellSize / 2;
    const endY = offsetY + (3 - toDisplay.displayRow) * cellSize + cellSize / 2;

    const animKey = `${to.row}-${to.col}`;
    const startTime = performance.now();
    const duration = CONFIG.ANIMATION_DURATION;

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Fun莽茫o de easing
      const easeProgress = 1 - Math.pow(1 - progress, 3);

      this.animatingPieces.set(animKey, {
        currentX: startX + (endX - startX) * easeProgress,
        currentY: startY + (endY - startY) * easeProgress
      });

      this.render();

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.animatingPieces.delete(animKey);
        if (callback) callback();
      }
    };

    requestAnimationFrame(animate);
  }

  // Obter c茅lula clicada (considerando invers茫o de perspetiva)
  getCellFromPoint(x, y) {
    const offsetX = 20;
    const offsetY = 20;
    const cellSize = CONFIG.CELL_SIZE;

    const displayCol = Math.floor((x - offsetX) / cellSize);
    const displayRow = 3 - Math.floor((y - offsetY) / cellSize);

    if (displayRow >= 0 && displayRow < 4 && displayCol >= 0 && displayCol < this.state.boardSize) {
      // Converter coordenadas de exibi莽茫o para coordenadas l贸gicas
      const { row, col } = this.fromDisplayCoords(displayRow, displayCol);
      const index = this.state.toIndex(row, col);
      return index;
    }
    return null;
  }
}


// ============================================
// Anima莽茫o do Dado
// ============================================
class DiceAnimator {
  constructor() {
    this.sticks = document.querySelectorAll('.stick');
    this.valueEl = document.getElementById('dice-value');
    this.nameEl = document.getElementById('dice-name');
  }

  // Mapeamento de nomes do dado
  getDiceName(value) {
    const names = {
      1: 'T芒b',
      2: 'Itneyn',
      3: 'Tel谩teh',
      4: "Arba'ah",
      6: 'Sitteh'
    };
    return names[value] || '';
  }

  // Reproduzir anima莽茫o de lan莽amento do dado
  animate(dice, callback) {
    const { stickValues, value } = dice;
    
    // Reiniciar
    this.sticks.forEach(stick => {
      stick.classList.remove('light', 'rolling');
    });
    this.valueEl.textContent = '?';
    this.nameEl.textContent = '';

    // Adicionar anima莽茫o de rolagem
    this.sticks.forEach((stick, i) => {
      setTimeout(() => {
        stick.classList.add('rolling');
      }, i * 100);
    });

    // Mostrar resultado
    setTimeout(() => {
      this.sticks.forEach((stick, i) => {
        stick.classList.remove('rolling');
        if (stickValues[i]) {
          stick.classList.add('light');
        }
      });

      this.valueEl.textContent = value;
      this.nameEl.textContent = this.getDiceName(value);

      if (callback) callback();
    }, 800);
  }

  reset() {
    this.sticks.forEach(stick => {
      stick.classList.remove('light', 'rolling');
    });
    this.valueEl.textContent = '-';
    this.nameEl.textContent = '';
  }
}

// ============================================
// Gestor de Mensagens
// ============================================
class MessageManager {
  constructor() {
    this.container = document.getElementById('message-list');
    this.maxMessages = 10;
  }

  add(text, type = 'info') {
    const msg = document.createElement('div');
    msg.className = `message ${type}`;
    msg.textContent = text;
    
    this.container.insertBefore(msg, this.container.firstChild);

    // Limitar n煤mero de mensagens
    while (this.container.children.length > this.maxMessages) {
      this.container.removeChild(this.container.lastChild);
    }

    // Rolar para o topo
    this.container.scrollTop = 0;
  }

  clear() {
    this.container.innerHTML = '';
  }
}

// ============================================
// Controlador Principal do Jogo
// ============================================
class GameController {
  constructor() {
    this.state = new GameState();
    this.api = new ServerAPI(CONFIG.SERVER_URL);
    this.session = new SessionManager();
    this.messages = new MessageManager();
    this.dice = new DiceAnimator();
    this.eventSource = null;

    // Inicializar Canvas
    this.canvas = document.getElementById('game-canvas');
    this.renderer = new GameRenderer(this.canvas, this.state);

    this.bindEvents();
    this.updateUI();
  }

  bindEvents() {
    // Formul谩rio de login
    document.getElementById('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleLogin();
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
      this.handleLogout();
    });

    // Controlo do jogo
    document.getElementById('start-game').addEventListener('click', () => {
      this.startGame();
    });

    document.getElementById('forfeit-game').addEventListener('click', () => {
      this.forfeitGame();
    });

    document.getElementById('roll-dice').addEventListener('click', () => {
      this.rollDice();
    });

    document.getElementById('pass-turn').addEventListener('click', () => {
      this.passTurn();
    });

    // Clicar na 谩rea do dado tamb茅m pode lan莽ar o dado
    document.getElementById('sticks-display').addEventListener('click', () => {
      this.rollDice();
    });

    // Classifica莽玫es
    document.getElementById('show-rankings').addEventListener('click', () => {
      this.showRankings();
    });

    document.getElementById('close-rankings').addEventListener('click', () => {
      document.getElementById('rankings-panel').classList.add('hidden');
      document.querySelector('.instructions-panel').classList.remove('hidden');
    });

    // Altera莽茫o de configura莽茫o - mostrar/ocultar configura莽茫o de IA ao mudar modo de jogo
    document.getElementById('game-mode').addEventListener('change', (e) => {
      const aiConfigs = document.querySelectorAll('.ai-config');
      aiConfigs.forEach(el => {
        el.style.display = e.target.value === 'ai' ? 'block' : 'none';
      });
    });
    
    // Definir visibilidade da configura莽茫o de IA com base no modo atual na inicializa莽茫o
    const initialMode = document.getElementById('game-mode').value;
    document.querySelectorAll('.ai-config').forEach(el => {
      el.style.display = initialMode === 'ai' ? 'block' : 'none';
    });

    // Eventos do Canvas
    this.canvas.addEventListener('click', (e) => {
      this.handleCanvasClick(e);
    });

    this.canvas.addEventListener('mousemove', (e) => {
      this.handleCanvasHover(e);
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.renderer.hoveredCell = null;
      this.renderer.render();
    });

    // Modal
    document.getElementById('play-again').addEventListener('click', () => {
      document.getElementById('game-over-modal').classList.add('hidden');
      this.resetGame();
    });

    document.getElementById('cancel-waiting').addEventListener('click', () => {
      this.cancelWaiting();
    });
  }

  // ============================================
  // Relacionado ao Login
  // ============================================
  async handleLogin() {
    const nick = document.getElementById('nick').value.trim();
    const password = document.getElementById('password').value;

    if (!nick || !password) {
      this.messages.add('Por favor, preencha todos os campos', 'warning');
      return;
    }

    try {
      await this.api.register(nick, password);
      this.session.saveSession(nick, password);
      this.state.myNick = nick;
      this.messages.add(`Bem-vindo, ${nick}!`, 'success');
      this.updateUI();
    } catch (error) {
      this.messages.add(`Falha no login: ${error.message}`, 'error');
    }
  }

  handleLogout() {
    this.session.logout();
    this.state.myNick = null;
    this.resetGame();
    this.messages.add('Sess茫o terminada', 'info');
    this.updateUI();
  }

  // ============================================
  // Controlo do Jogo
  // ============================================
  async startGame() {
    if (!this.session.isAuthenticated) {
      this.messages.add('Por favor, fa莽a login primeiro', 'warning');
      return;
    }

    const mode = document.getElementById('game-mode').value;
    const size = parseInt(document.getElementById('board-size').value);

    this.state.reset();
    this.state.boardSize = size;
    this.state.myNick = this.session.nick;
    this.renderer.resize();

    if (mode === 'online') {
      await this.startOnlineGame(size);
    } else {
      this.startAIGame(size);
    }
  }

  async startOnlineGame(size) {
    this.state.isOnline = true;
    
    // Ler group ID da UI
    const groupId = parseInt(document.getElementById('group-id').value) || CONFIG.GROUP_ID;
    
    // Atualizar informa莽玫es do modal de espera
    document.getElementById('waiting-group').textContent = groupId;
    document.getElementById('waiting-size').textContent = size;
    document.getElementById('waiting-modal').classList.remove('hidden');

    try {
      const result = await this.api.join(
        groupId,
        this.session.nick,
        this.session.password,
        size
      );

      this.state.gameId = result.game;
      this.messages.add(`Aguardando advers谩rio... (Grupo ${groupId}, ${size} colunas)`, 'info');

      // Estabelecer conex茫o SSE
      this.connectSSE();

    } catch (error) {
      document.getElementById('waiting-modal').classList.add('hidden');
      this.messages.add(`Falha ao entrar no jogo: ${error.message}`, 'error');
    }
  }

  startAIGame(size) {
    this.state.isOnline = false;
    this.state.isStarted = true;
    this.state.myColor = 'Blue';
    this.state.opponentNick = 'AI';
    this.state.turn = this.session.nick;

    // Ocultar ecr茫 de boas-vindas
    const welcomeScreen = document.getElementById('welcome-screen');
    if (welcomeScreen) {
      welcomeScreen.style.display = 'none';
    }

    // Inicializar tabuleiro
    this.initializeLocalBoard(size);
    
    this.messages.add('Jogo iniciado! Voc锚 joga com as pe莽as azuis', 'success');
    this.updateUI();
    this.renderer.render();
  }

  initializeLocalBoard(size) {
    this.state.pieces = new Array(4 * size).fill(null);
    
    // Pe莽as azuis (parte inferior)
    for (let i = 0; i < size; i++) {
      this.state.pieces[i] = {
        color: 'Blue',
        inMotion: false,
        reachedLastRow: false
      };
    }
    
    // Pe莽as vermelhas (parte superior)
    for (let i = 0; i < size; i++) {
      this.state.pieces[3 * size + (size - 1 - i)] = {
        color: 'Red',
        inMotion: false,
        reachedLastRow: false
      };
    }
  }

  // ============================================
  // Conex茫o SSE
  // ============================================
  connectSSE() {
    const url = `${CONFIG.SERVER_URL}/update?nick=${encodeURIComponent(this.session.nick)}&game=${encodeURIComponent(this.state.gameId)}`;
    
    this.eventSource = new EventSource(url);

    this.eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleSSEUpdate(data);
    };

    this.eventSource.onerror = (error) => {
      console.error('SSE Error:', error);
      this.messages.add('Conex茫o perdida', 'error');
    };
  }

  handleSSEUpdate(data) {

    // Atualizar estado do jogo
    if (data.pieces) this.state.pieces = data.pieces;
    if (data.turn) this.state.turn = data.turn;
    if (data.step) this.state.step = data.step;
    // dice pode ser null, precisa de tratamento especial
    if ('dice' in data) {
      this.state.dice = data.dice;
      if (!data.dice) {
        this.dice.reset();  // Limpar exibi莽茫o do dado
      }
    }
    if ('selected' in data) {
      this.state.selected = data.selected || [];
      // No modo online, calcular posi莽玫es de movimento v谩lidas quando uma pe莽a 茅 selecionada
      if (this.state.isOnline && this.state.selected.length > 0 && this.state.dice) {
        this.calculateValidMoves(this.state.selected[0]);
      } else {
        this.renderer.validMoves = [];
      }
    }
    if (data.mustPass !== undefined) this.state.mustPass = data.mustPass;

    // Emparelhamento de jogadores
    if (data.players && !this.state.isStarted) {
      document.getElementById('waiting-modal').classList.add('hidden');
      const welcomeScreen = document.getElementById('welcome-screen');
      if (welcomeScreen) welcomeScreen.style.display = 'none';
      this.state.isStarted = true;
      
      // Garantir que myNick est谩 definido
      if (!this.state.myNick) {
        this.state.myNick = this.session.nick;
      }
      
      const players = data.players;
      
      for (const [nick, color] of Object.entries(players)) {
        if (nick === this.state.myNick) {
          this.state.myColor = color;
        } else {
          this.state.opponentNick = nick;
        }
      }
      
      this.messages.add(`Advers谩rio: ${this.state.opponentNick}`, 'success');
    }

    // Anima莽茫o do dado
    if (data.dice) {
      this.dice.animate(data.dice);
    }

    // Fim do jogo
    if (data.winner) {
      this.state.winner = data.winner;
      this.state.isOver = true;
      this.showGameOver(data.winner);
    }

    this.updateUI();
    this.renderer.render();
  }

  disconnectSSE() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  cancelWaiting() {
    document.getElementById('waiting-modal').classList.add('hidden');
    this.disconnectSSE();
    this.resetGame();
  }


  // ============================================
  // Opera莽玫es do Jogo
  // ============================================
  async rollDice() {
    if (!this.state.isMyTurn() || this.state.dice) {
      return;
    }

    if (this.state.isOnline) {
      try {
        await this.api.roll(
          this.session.nick,
          this.session.password,
          this.state.gameId,
          this.state.boardSize
        );
      } catch (error) {
        this.messages.add(`Falha ao lan莽ar dado: ${error.message}`, 'error');
      }
    } else {
      // Modo IA local
      const dice = this.rollLocalDice();
      this.state.dice = dice;
      this.dice.animate(dice, () => {
        // Verificar se h谩 pe莽as que podem mover
        const canMove = this.checkCanMove();
        this.state.mustPass = !canMove;
        
        if (!canMove) {
          this.messages.add('Nenhuma pe莽a pode mover, passe a vez', 'warning');
        }
        
        this.updateUI();
        this.renderer.render();
      });
    }
  }

  // Verificar se o jogador atual tem pe莽as que podem mover
  checkCanMove() {
    const myColor = this.state.myColor;
    const diceValue = this.state.dice?.value;
    if (!diceValue) return false;

    for (let i = 0; i < this.state.pieces.length; i++) {
      const piece = this.state.pieces[i];
      if (!piece || piece.color !== myColor) continue;

      // Pe莽as n茫o movidas s贸 podem mover com T芒b (1)
      if (!piece.inMotion && diceValue !== 1) continue;

      // Calcular posi莽茫o de destino
      const { row, col } = this.state.fromIndex(i);
      const targetIndex = this.calculateTargetPosition(row, col, diceValue, myColor === 'Blue');

      if (targetIndex !== null) {
        const targetPiece = this.state.pieces[targetIndex];
        if (!targetPiece || targetPiece.color !== myColor) {
          return true;
        }
      }
    }

    return false;
  }

  rollLocalDice() {
    const rand = Math.random();
    let lightCount;
    if (rand < 0.0625) lightCount = 0;
    else if (rand < 0.3125) lightCount = 1;
    else if (rand < 0.6875) lightCount = 2;
    else if (rand < 0.9375) lightCount = 3;
    else lightCount = 4;

    const stickValues = [false, false, false, false];
    const indices = [0, 1, 2, 3];
    for (let i = 0; i < lightCount; i++) {
      const idx = Math.floor(Math.random() * indices.length);
      stickValues[indices[idx]] = true;
      indices.splice(idx, 1);
    }

    const value = lightCount === 0 ? 6 : lightCount;
    const keepPlaying = [1, 4, 6].includes(value);

    return { stickValues, value, keepPlaying };
  }

  async passTurn() {
    if (!this.state.isMyTurn() || !this.state.mustPass) {
      return;
    }

    if (this.state.isOnline) {
      try {
        await this.api.pass(
          this.session.nick,
          this.session.password,
          this.state.gameId,
          this.state.boardSize
        );
      } catch (error) {
        this.messages.add(`Falha ao passar: ${error.message}`, 'error');
      }
    } else {
      this.switchTurnLocal();
    }
  }

  async forfeitGame() {
    if (!this.state.isStarted || this.state.isOver) {
      return;
    }

    if (this.state.isOnline) {
      try {
        await this.api.leave(
          this.session.nick,
          this.session.password,
          this.state.gameId
        );
        this.disconnectSSE();
      } catch (error) {
        this.messages.add(`Falha ao desistir: ${error.message}`, 'error');
      }
    }

    this.showGameOver(this.state.opponentNick);
  }

  // ============================================
  // Intera莽茫o com Canvas
  // ============================================
  handleCanvasClick(e) {
    if (!this.state.isStarted || this.state.isOver) return;
    if (!this.state.isMyTurn()) {
      this.messages.add('N茫o 茅 a sua vez', 'warning');
      return;
    }
    if (!this.state.dice) {
      this.messages.add('Lance o dado primeiro', 'warning');
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cellIndex = this.renderer.getCellFromPoint(x, y);

    if (cellIndex === null) return;

    if (this.state.isOnline) {
      this.sendMove(cellIndex);
    } else {
      this.handleLocalMove(cellIndex);
    }
  }

  handleCanvasHover(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    this.renderer.hoveredCell = this.renderer.getCellFromPoint(x, y);
    this.renderer.render();
  }

  async sendMove(cellIndex) {
    try {
      await this.api.notify(
        this.session.nick,
        this.session.password,
        this.state.gameId,
        cellIndex
      );
    } catch (error) {
      this.messages.add(`Falha ao mover: ${error.message}`, 'error');
    }
  }

  handleLocalMove(cellIndex) {
    const piece = this.state.pieces[cellIndex];
    const myColor = this.state.myColor;

    if (this.state.step === 'from') {
      // Selecionar pe莽a
      if (!piece || piece.color !== myColor) {
        this.messages.add('Selecione uma pe莽a sua', 'warning');
        return;
      }

      // Verificar se pode mover
      if (!piece.inMotion && this.state.dice.value !== 1) {
        this.messages.add('Pe莽as n茫o movidas s贸 podem mover com T芒b (1)', 'warning');
        return;
      }

      // Calcular movimentos v谩lidos primeiro
      this.calculateValidMoves(cellIndex);
      
      // Verificar se h谩 movimentos v谩lidos
      if (this.renderer.validMoves.length === 0) {
        this.messages.add('Esta pe莽a n茫o pode mover (destino bloqueado)', 'warning');
        this.renderer.validMoves = [];
        return;
      }

      this.state.selected = [cellIndex];
      this.state.step = 'to';
      this.messages.add('Selecione o destino (destacado em verde)', 'info');

    } else {
      // Selecionar destino
      if (this.state.selected[0] === cellIndex) {
        // Cancelar sele莽茫o
        this.state.selected = [];
        this.state.step = 'from';
        this.renderer.validMoves = [];
      } else if (this.renderer.validMoves.includes(cellIndex)) {
        // Executar movimento
        this.executeLocalMove(this.state.selected[0], cellIndex);
      } else {
        this.messages.add('Destino inv谩lido', 'warning');
      }
    }

    this.renderer.render();
  }

  calculateValidMoves(fromIndex) {
    const { row, col } = this.state.fromIndex(fromIndex);
    const piece = this.state.pieces[fromIndex];
    const steps = this.state.dice.value;
    const isBlue = piece.color === 'Blue';

    // Calcular posi莽茫o de destino
    const targetIndex = this.calculateTargetPosition(row, col, steps, isBlue);
    
    this.renderer.validMoves = [];
    if (targetIndex !== null) {
      const targetPiece = this.state.pieces[targetIndex];
      // N茫o pode mover para cima da pr贸pria pe莽a
      if (!targetPiece || targetPiece.color !== piece.color) {
        this.renderer.validMoves.push(targetIndex);
      }
    }
  }

  calculateTargetPosition(row, col, steps, isBlue) {
    let newRow = row;
    let newCol = col;
    const size = this.state.boardSize;

    for (let i = 0; i < steps; i++) {
      if (isBlue) {
        // Caminho azul: linha 0 para direita -> linha 1 para esquerda -> linha 2 para direita -> linha 3 para esquerda
        if (newRow === 0) {
          newCol++;
          if (newCol >= size) {
            newRow = 1;
            newCol = size - 1;
          }
        } else if (newRow === 1) {
          newCol--;
          if (newCol < 0) {
            newRow = 2;
            newCol = 0;
          }
        } else if (newRow === 2) {
          newCol++;
          if (newCol >= size) {
            newRow = 3;
            newCol = size - 1;
          }
        } else if (newRow === 3) {
          newCol--;
          if (newCol < 0) {
            return null; // Fora do tabuleiro, pe莽a sai
          }
        }
      } else {
        // Caminho vermelho: linha 3 para esquerda -> linha 2 para direita -> linha 1 para esquerda -> linha 0 para direita
        if (newRow === 3) {
          newCol--;
          if (newCol < 0) {
            newRow = 2;
            newCol = 0;
          }
        } else if (newRow === 2) {
          newCol++;
          if (newCol >= size) {
            newRow = 1;
            newCol = size - 1;
          }
        } else if (newRow === 1) {
          newCol--;
          if (newCol < 0) {
            newRow = 0;
            newCol = 0;
          }
        } else if (newRow === 0) {
          newCol++;
          if (newCol >= size) {
            return null; // Fora do tabuleiro, pe莽a sai
          }
        }
      }

      if (newRow < 0 || newRow >= 4) return null;
    }

    return this.state.toIndex(newRow, newCol);
  }

  executeLocalMove(fromIndex, toIndex) {
    const piece = { ...this.state.pieces[fromIndex] };
    const targetPiece = this.state.pieces[toIndex];
    const { row: toRow } = this.state.fromIndex(toIndex);

    // Capturar pe莽a
    if (targetPiece) {
      this.messages.add('Pe莽a capturada!', 'success');
    }

    // Atualizar estado da pe莽a
    piece.inMotion = true;
    if ((piece.color === 'Blue' && toRow === 3) || 
        (piece.color === 'Red' && toRow === 0)) {
      piece.reachedLastRow = true;
    }

    // Movimento com anima莽茫o
    this.renderer.animateMove(fromIndex, toIndex, () => {
      this.state.pieces[fromIndex] = null;
      this.state.pieces[toIndex] = piece;
      
      // Verificar vit贸ria
      const winner = this.checkWinner();
      if (winner) {
        this.showGameOver(winner === 'Blue' ? this.session.nick : 'AI');
        return;
      }

      // Reiniciar sele莽茫o
      this.state.selected = [];
      this.state.step = 'from';
      this.renderer.validMoves = [];

      // Guardar informa莽茫o do turno atual (para uso em callback ass铆ncrono)
      // Determinar pela cor da pe莽a: azul 茅 jogador, vermelho 茅 IA
      const isAITurn = piece.color === 'Red';
      const canKeepPlaying = this.state.dice.keepPlaying;
      
      // Verificar se pode continuar
      if (canKeepPlaying) {
        this.state.dice = null;
        this.dice.reset();
        
        // Distinguir entre jogador e IA
        if (isAITurn) {
          this.messages.add('IA pode lan莽ar novamente!', 'info');
          this.updateUI();
          this.renderer.render();
          // IA lan莽a o dado novamente automaticamente
          setTimeout(() => this.aiTurn(), 800);
        } else {
          this.messages.add('Pode lan莽ar novamente!', 'info');
          this.updateUI();
          this.renderer.render();
        }
      } else {
        this.switchTurnLocal();
        this.updateUI();
        this.renderer.render();
      }
    });
  }

  switchTurnLocal() {
    this.state.dice = null;
    this.state.mustPass = null;
    this.dice.reset();
    this.state.selected = [];
    this.state.step = 'from';
    this.renderer.validMoves = [];

    if (this.state.turn === this.session.nick) {
      this.state.turn = 'AI';
      this.messages.add('Vez da IA', 'info');
      setTimeout(() => this.aiTurn(), 1000);
    } else {
      this.state.turn = this.session.nick;
      this.messages.add('Sua vez', 'info');
    }

    this.updateUI();
  }

  checkWinner() {
    let blueCount = 0;
    let redCount = 0;
    
    for (const piece of this.state.pieces) {
      if (piece) {
        if (piece.color === 'Blue') blueCount++;
        else redCount++;
      }
    }

    if (blueCount === 0) return 'Red';
    if (redCount === 0) return 'Blue';
    return null;
  }

  // ============================================
  // L贸gica da IA
  // ============================================
  aiTurn() {
    if (this.state.turn !== 'AI' || this.state.isOver) return;

    // Lan莽ar dado
    const dice = this.rollLocalDice();
    this.state.dice = dice;
    
    this.dice.animate(dice, () => {
      setTimeout(() => {
        this.aiMakeMove();
      }, 500);
    });
  }

  aiMakeMove() {
    const aiLevel = document.getElementById('ai-level').value;
    const validMoves = this.getAIValidMoves();

    if (validMoves.length === 0) {
      this.messages.add('IA n茫o pode mover', 'info');
      if (this.state.dice.keepPlaying) {
        this.state.dice = null;
        setTimeout(() => this.aiTurn(), 500);
      } else {
        this.switchTurnLocal();
      }
      return;
    }

    // Escolher movimento
    let move;
    if (aiLevel === 'easy') {
      move = validMoves[Math.floor(Math.random() * validMoves.length)];
    } else {
      // Priorizar captura
      const captureMoves = validMoves.filter(m => 
        this.state.pieces[m.to] && this.state.pieces[m.to].color === 'Blue'
      );
      
      if (captureMoves.length > 0 && (aiLevel === 'hard' || Math.random() > 0.5)) {
        move = captureMoves[Math.floor(Math.random() * captureMoves.length)];
      } else {
        move = validMoves[Math.floor(Math.random() * validMoves.length)];
      }
    }

    // Executar movimento
    this.executeLocalMove(move.from, move.to);
  }

  getAIValidMoves() {
    const moves = [];
    const size = this.state.boardSize;

    for (let i = 0; i < this.state.pieces.length; i++) {
      const piece = this.state.pieces[i];
      if (!piece || piece.color !== 'Red') continue;

      // Verificar se pode mover
      if (!piece.inMotion && this.state.dice.value !== 1) continue;

      const { row, col } = this.state.fromIndex(i);
      const targetIndex = this.calculateTargetPosition(row, col, this.state.dice.value, false);

      if (targetIndex !== null) {
        const targetPiece = this.state.pieces[targetIndex];
        if (!targetPiece || targetPiece.color !== 'Red') {
          moves.push({ from: i, to: targetIndex });
        }
      }
    }

    return moves;
  }

  // ============================================
  // Atualiza莽茫o da UI
  // ============================================
  updateUI() {
    const isLoggedIn = this.session.isAuthenticated;
    
    // Estado de login
    document.getElementById('login-form').classList.toggle('hidden', isLoggedIn);
    document.getElementById('user-info').classList.toggle('hidden', !isLoggedIn);
    if (isLoggedIn) {
      document.getElementById('user-nick').textContent = this.session.nick;
    }

    // Bot玫es de controlo do jogo
    document.getElementById('start-game').disabled = !isLoggedIn || this.state.isStarted;
    document.getElementById('forfeit-game').disabled = !this.state.isStarted || this.state.isOver;
    
    // Bot玫es de dado e passar
    const canRoll = this.state.isStarted && !this.state.isOver && 
                    this.state.isMyTurn() && !this.state.dice;
    const canPass = this.state.isStarted && !this.state.isOver && 
                    this.state.isMyTurn() && this.state.mustPass;
    
    document.getElementById('roll-dice').disabled = !canRoll;
    document.getElementById('pass-turn').disabled = !canPass;

    // Indicador de turno
    const turnIndicator = document.getElementById('turn-indicator');
    if (!this.state.isStarted) {
      turnIndicator.textContent = 'Aguardando...';
      turnIndicator.className = 'turn-indicator';
    } else if (this.state.isOver) {
      turnIndicator.textContent = 'Jogo Terminado';
      turnIndicator.className = 'turn-indicator';
    } else if (this.state.isMyTurn()) {
      turnIndicator.textContent = 'Sua Vez';
      turnIndicator.className = 'turn-indicator my-turn';
    } else {
      turnIndicator.textContent = `Vez de ${this.state.turn}`;
      turnIndicator.className = 'turn-indicator opponent-turn';
    }

    // Informa莽茫o dos jogadores
    document.getElementById('player1-name').textContent = 
      this.state.myColor === 'Blue' ? (this.state.myNick || 'Voc锚') : (this.state.opponentNick || 'Advers谩rio');
    document.getElementById('player2-name').textContent = 
      this.state.myColor === 'Red' ? (this.state.myNick || 'Voc锚') : (this.state.opponentNick || 'Advers谩rio');
    
    document.getElementById('player1-pieces').textContent = this.state.getPieceCount('Blue');
    document.getElementById('player2-pieces').textContent = this.state.getPieceCount('Red');
  }

  // ============================================
  // Classifica莽玫es
  // ============================================
  async showRankings() {
    const size = parseInt(document.getElementById('board-size').value);
    const groupId = parseInt(document.getElementById('group-id').value) || CONFIG.GROUP_ID;
    
    // Atualizar exibi莽茫o de informa莽玫es das classifica莽玫es
    document.getElementById('ranking-group').textContent = groupId;
    document.getElementById('ranking-size').textContent = size;
    
    try {
      const result = await this.api.ranking(groupId, size);
      this.displayRankings(result.ranking || []);
    } catch (error) {
      this.messages.add('Falha ao obter classifica莽玫es', 'error');
    }
  }

  displayRankings(rankings) {
    const tbody = document.querySelector('#rankings-table tbody');
    tbody.innerHTML = '';

    if (rankings.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="4" style="text-align:center">Sem dados</td>';
      tbody.appendChild(tr);
    } else {
      rankings.forEach((r, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${i + 1}</td>
          <td>${r.nick}</td>
          <td>${r.victories}</td>
          <td>${r.games}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    document.querySelector('.instructions-panel').classList.add('hidden');
    document.getElementById('rankings-panel').classList.remove('hidden');
  }

  // ============================================
  // Fim do Jogo
  // ============================================
  showGameOver(winner) {
    this.state.isOver = true;
    this.disconnectSSE();

    const isWinner = winner === this.session.nick;
    document.getElementById('winner-text').textContent = isWinner ? '馃弳 Voc锚 Ganhou!' : '馃槩 Voc锚 Perdeu';
    document.getElementById('winner-name').textContent = `Vencedor: ${winner}`;
    document.getElementById('game-over-modal').classList.remove('hidden');

    this.updateUI();
  }

  resetGame() {
    this.state.reset();
    this.dice.reset();
    this.renderer.validMoves = [];
    this.renderer.hoveredCell = null;
    this.renderer.resize();
    this.renderer.render();
    this.updateUI();
    
    // Restaurar ecr茫 de boas-vindas
    const welcomeScreen = document.getElementById('welcome-screen');
    if (welcomeScreen) welcomeScreen.style.display = '';
  }
}

// ============================================
// Inicializa莽茫o
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  window.game = new GameController();
});

