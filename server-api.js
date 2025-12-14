// ============================================
// Server API Module
// ============================================

export class ServerAPI {
  constructor(baseUrl = 'http://localhost:8008') {
    this.baseUrl = baseUrl;
  }

  async request(endpoint, data) {
    const response = await fetch(`${this.baseUrl}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    const result = await response.json();
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    return result;
  }

  // Registo/Login
  async register(nick, password) {
    return this.request('register', { nick, password });
  }

  // Entrar no jogo
  async join(group, nick, password, size) {
    return this.request('join', { group, nick, password, size });
  }

  // Sair do jogo
  async leave(nick, password, game) {
    return this.request('leave', { nick, password, game });
  }

  // Lancar dado
  async roll(nick, password, game, size) {
    return this.request('roll', { nick, password, game, size });
  }

  // Passar turno
  async pass(nick, password, game, size) {
    return this.request('pass', { nick, password, game, size });
  }

  // Notificar movimento
  async notify(nick, password, game, move) {
    return this.request('notify', { nick, password, game, move });
  }

  // Obter classificacoes
  async ranking(group, size) {
    return this.request('ranking', { group, size });
  }
}

// ============================================
// Session Manager
// Nao usa nenhum armazenamento, cada instancia de pagina gere a sessao independentemente
// ============================================

export class SessionManager {
  constructor() {
    // Nao le do armazenamento, cada instancia de pagina e independente
    this.nick = null;
    this.password = null;
  }

  get isAuthenticated() {
    return this.nick !== null && this.password !== null;
  }

  saveSession(nick, password) {
    this.nick = nick;
    this.password = password;
  }

  logout() {
    this.nick = null;
    this.password = null;
  }
}