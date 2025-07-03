import ServerPlayer from './ServerPlayer.js';
import Votekick from './VoteKick.js';
import { HEADER, ENDC, OKCYAN, OKBLUE } from '../bcolors.js';
import isAppropriateString from '../moderation/is-appropriate-string.js';
import { MODE_ENUM } from '../../quizbowl/constants.js';
import ScienceBowlRoom from '../../client/singleplayer/ScienceBowlRoom.js';
import RateLimit from '../RateLimit.js';
import getRandomScienceBowlQuestions from '../../database/science-bowl/get-query.js';
import ScienceBowlCategoryManager from '../../quizbowl/ScienceBowlCategoryManager.js';
import answerValidator from '../../client/multiplayerlayer/answer-validator-multiplayer.js';

export default class ServerScienceBowlRoom extends ScienceBowlRoom {
  constructor(name, ownerId, isPermanent = false, subjects = []) {
    super(name, subjects);
    this.ownerId = ownerId;
    this.isPermanent = isPermanent;
    this.getRandomQuestions = getRandomScienceBowlQuestions;
    this.categoryManager = new ScienceBowlCategoryManager(subjects);
    this.bannedUserList = new Map();
    this.kickedUserList = new Map();
    this.votekickList = [];
    this.lastVotekickTime = {};
    this.rateLimiter = new RateLimit(50, 1000);
    this.rateLimitExceeded = new Set();
    this.settings = {
      ...this.settings,
      lock: false,
      loginRequired: false,
      public: true,
      controlled: false
    };
    this.players = this.players || {};
    this.sockets = this.sockets || {};
    setInterval(this.cleanupExpiredBansAndKicks.bind(this), 5 * 60 * 1000);
  }

  async message(userId, message) {
    switch (message.type) {
      case 'ban': return this.ban(userId, message);
      case 'chat': return this.chat(userId, message);
      case 'chat-live-update': return this.chatLiveUpdate(userId, message);
      case 'give-answer-live-update': return this.giveAnswerLiveUpdate(userId, message);
      case 'toggle-controlled': return this.toggleControlled(userId, message);
      case 'toggle-lock': return this.toggleLock(userId, message);
      case 'toggle-login-required': return this.toggleLoginRequired(userId, message);
      case 'toggle-mute': return this.toggleMute(userId, message);
      case 'toggle-public': return this.togglePublic(userId, message);
      case 'votekick-init': return this.votekickInit(userId, message);
      case 'votekick-vote': return this.votekickVote(userId, message);
      default: super.message(userId, message);
    }
  }

  allowed(userId) {
    return (userId === this.ownerId) || !this.settings.controlled;
  }

  connection(socket, userId, username, ip, userAgent = '') {
    this.cleanupExpiredBansAndKicks();
    if (this.sockets[userId]) {
      this.sendToSocket(userId, { type: 'error', message: 'You joined on another tab' });
      setTimeout(() => this.close(userId), 5000);
    }
    const isNew = !(userId in this.players);
    if (isNew) { this.players[userId] = new ServerPlayer(userId); }
    this.players[userId].online = true;
    this.sockets[userId] = socket;
    username = this.players[userId].safelySetUsername(username);
    if (this.bannedUserList.has(userId)) {
      this.sendToSocket(userId, { type: 'enforcing-removal', removalType: 'ban' });
      return;
    }
    if (this.kickedUserList.has(userId)) {
      this.sendToSocket(userId, { type: 'enforcing-removal', removalType: 'kick' });
      return;
    }
    socket.on('message', message => {
      if (this.rateLimiter(socket) && !this.rateLimitExceeded.has(username)) {
        this.rateLimitExceeded.add(username);
        return;
      }
      try {
        message = JSON.parse(message);
      } catch (error) {
        return;
      }
      this.message(userId, message);
    });
    socket.on('close', this.close.bind(this, userId));
    socket.send(JSON.stringify({
      type: 'connection-acknowledged',
      userId,
      ownerId: this.ownerId,
      players: this.players,
      isPermanent: this.isPermanent,
      buzzedIn: this.buzzedIn,
      canBuzz: this.settings.rebuzz || !this.buzzes?.includes(userId),
      mode: this.mode,
      packetLength: this.packetLength,
      questionProgress: this.tossupProgress,
      setLength: this.setLength,
      settings: this.settings
    }));
    socket.send(JSON.stringify({ type: 'connection-acknowledged-query', ...this.query, ...this.categoryManager.export() }));
    socket.send(JSON.stringify({ type: 'connection-acknowledged-tossup', tossup: this.tossup }));
    this.emitMessage({ type: 'join', isNew, userId, username, user: this.players[userId] });
  }

  close(userId) {
    if (!this.players[userId]) return;
    if (this.buzzedIn === userId) {
      this.giveAnswer(userId, { givenAnswer: this.liveAnswer });
      this.buzzedIn = null;
    }
    this.leave(userId);
  }

  chat(userId, { message }) {
    if (this.settings.public || typeof message !== 'string') { return false; }
    const username = this.players[userId].username;
    this.emitMessage({ type: 'chat', message, username, userId });
  }

  chatLiveUpdate(userId, { message }) {
    if (this.settings.public || typeof message !== 'string') { return false; }
    const username = this.players[userId].username;
    this.emitMessage({ type: 'chat-live-update', message, username, userId });
  }

  cleanupExpiredBansAndKicks() {
    const now = Date.now();
    this.bannedUserList.forEach((banTime, userId) => {
      if (now - banTime > 1000 * 60 * 30) {
        this.bannedUserList.delete(userId);
      }
    });
    this.kickedUserList.forEach((kickTime, userId) => {
      if (now - kickTime > 1000 * 60 * 30) {
        this.kickedUserList.delete(userId);
      }
    });
  }

  ban(userId, { targetId, targetUsername }) {
    if (this.ownerId !== userId) { return; }
    this.emitMessage({ type: 'confirm-ban', targetId, targetUsername });
    this.bannedUserList.set(targetId, Date.now());
    setTimeout(() => this.close(targetId), 1000);
  }

  // Votekick, mute, and other moderation features can be ported/adapted as needed from ServerTossupRoom.js
  // ...
} 