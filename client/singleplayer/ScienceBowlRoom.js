import { SBCATEGORIES } from '../../quizbowl/categories.js';
import QuestionRoom from '../../quizbowl/QuestionRoom.js';
import ScienceBowlCategoryManager from '../../quizbowl/ScienceBowlCategoryManager.js';

export default class ScienceBowlRoom extends QuestionRoom {
  constructor(name = 'science-bowl', subjects = SBCATEGORIES) {
    super(name);

    this.settings = {
      ...this.settings,
      skip: true,
      showHistory: true,
      typeToAnswer: true,
      timer: true,
      strictness: 7,
      readingSpeed: 50
    };

    this.query = {
      subjects,
      competitions: [],
      years: [],
      isMcq: undefined,
      isTossup: undefined,
      maxReturnLength: 50,
      randomize: true,
      caseSensitive: false
    };

    this.mode = 'random questions';
    this.previous = {
      celerity: 0,
      endOfQuestion: false,
      inPower: false,
      isCorrect: false,
      tossup: null,
      userId: null,
      powerValue: 0,
      negValue: -5
    };

    // Use the science bowl specific category manager
    this.categoryManager = new ScienceBowlCategoryManager(subjects);

    // Initialize pause-related state
    this.timeoutID = null;
    this.paused = false;
    this.questionSplit = [];
    this.wordIndex = 0;
    this.tossupProgress = 'NOT_STARTED';
  }

  async message(userId, message) {
    console.log('ScienceBowlRoom: Received message:', message);
    switch (message.type) {
      case 'start':
        console.log('ScienceBowlRoom: Handling start message');
        return this.next(userId, { type: 'start' });
      case 'next':
        console.log('ScienceBowlRoom: Handling next message');
        return this.next(userId, { type: 'next' });
      case 'pause':
        console.log('ScienceBowlRoom: Handling pause message');
        return this.pause(userId);
      case 'toggle-show-history': return this.toggleShowHistory(userId, message);
      case 'toggle-timer': return this.toggleTimer(userId, message);
      case 'toggle-type-to-answer': return this.toggleTypeToAnswer(userId, message);
      case 'toggle-rebuzz': return this.toggleRebuzz(userId, message);
      case 'set-strictness': return this.setStrictness(userId, message);
      case 'set-reading-speed': return this.setReadingSpeed(userId, message);
      case 'set-subjects': return this.setSubjects(userId, message);
      default:
        console.log('ScienceBowlRoom: Forwarding to parent class');
        return super.message(userId, message);
    }
  }

  async next(userId, { type }) {
    console.log('ScienceBowlRoom: next() called with type:', type);
    
    // Check if we can advance
    if (this.buzzedIn) {
      console.log('Cannot advance - someone has buzzed in');
      return false;
    }
    if (this.queryingQuestion) {
      console.log('Cannot advance - already querying question');
      return false;
    }
    if (this.tossupProgress === 'READING' && !this.settings.skip) {
      console.log('Cannot advance - question is reading and skip is disabled');
      return false;
    }

    console.log('ScienceBowlRoom: next() called');
    const question = await this.advanceQuestion();
    console.log('ScienceBowlRoom: advanceQuestion returned:', question);
    
    if (question === null) {
      console.log('ScienceBowlRoom: No question found');
      this.emitMessage({ type: 'no-questions-found' });
      return;
    }

    // Reset previous question text
    this.emitMessage({ type: 'reset-question' });

    // Split question into words for reading
    this.questionSplit = question.question_text.split(' ').filter(word => word !== '');
    this.wordIndex = 0;
    this.tossupProgress = 'READING';

    console.log('ScienceBowlRoom: Emitting question:', question);
    this.emitMessage({ type: 'question', question });
    
    // Start reading the question
    this.readQuestion(Date.now());
    return question;
  }

  async readQuestion(expectedReadTime) {
    if (!this.questionSplit || this.wordIndex >= this.questionSplit.length) {
      return;
    }

    const word = this.questionSplit[this.wordIndex];
    this.wordIndex++;
    this.emitMessage({ type: 'update-question', word });

    // Calculate time needed before reading next word
    let time = Math.log(word.length) + 1;
    if (word.endsWith('.') || word.endsWith('!') || word.endsWith('?')) {
      time += 2;
    } else if (word.endsWith(',')) {
      time += 0.75;
    }

    time = time * 0.9 * (125 - this.settings.readingSpeed);
    const delay = time - Date.now() + expectedReadTime;

    this.timeoutID = setTimeout(() => {
      if (!this.paused) {
        this.readQuestion(time + expectedReadTime);
      }
    }, delay);
  }

  toggleShowHistory(userId, { showHistory }) {
    this.settings.showHistory = showHistory;
    this.emitMessage({ type: 'toggle-show-history', showHistory, userId });
  }

  toggleTimer(userId, { timer }) {
    this.settings.timer = timer;
    this.emitMessage({ type: 'toggle-timer', timer, userId });
  }

  toggleTypeToAnswer(userId, { typeToAnswer }) {
    this.settings.typeToAnswer = typeToAnswer;
    this.emitMessage({ type: 'toggle-type-to-answer', typeToAnswer, userId });
  }

  toggleRebuzz(userId, { rebuzz }) {
    this.settings.rebuzz = rebuzz;
    this.emitMessage({ type: 'toggle-rebuzz', rebuzz, userId });
  }

  setStrictness(userId, { strictness }) {
    this.settings.strictness = strictness;
    this.emitMessage({ type: 'set-strictness', strictness, userId });
  }

  setReadingSpeed(userId, { readingSpeed }) {
    this.settings.readingSpeed = readingSpeed;
    this.emitMessage({ type: 'set-reading-speed', readingSpeed, userId });
  }

  setSubjects(userId, { subjects }) {
    this.query.subjects = subjects;
    this.emitMessage({ type: 'set-subjects', subjects, userId });
  }

  pause(userId) {
    console.log('ScienceBowlRoom: pause() called');
    if (this.buzzedIn) { 
      console.log('ScienceBowlRoom: Cannot pause - someone has buzzed in');
      return false; 
    }
    if (this.tossupProgress === 'ANSWER_REVEALED') { 
      console.log('ScienceBowlRoom: Cannot pause - answer is already revealed');
      return false; 
    }

    this.paused = !this.paused;
    console.log('ScienceBowlRoom: Pause state set to:', this.paused);
    
    if (this.paused) {
      console.log('ScienceBowlRoom: Pausing - clearing timers');
      clearTimeout(this.timeoutID);
      clearInterval(this.timer?.interval);
    } else if (this.wordIndex >= this.questionSplit.length) {
      console.log('ScienceBowlRoom: Resuming - revealing question');
      this.revealQuestion();
    } else {
      console.log('ScienceBowlRoom: Resuming - continuing question reading');
      this.readQuestion(Date.now());
    }
    
    this.emitMessage({ type: 'pause', paused: this.paused });
    return true;
  }
} 