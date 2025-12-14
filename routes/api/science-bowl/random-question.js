import express from 'express';
import { getRandomQuestions } from '../../../database/science-bowl/get-random-questions.js';

const router = express.Router();

// Add logging middleware
router.use((req, res, next) => {
  console.log('API: Science Bowl Random Question - Request received:', {
    method: req.method,
    url: req.originalUrl,
    query: req.query,
    params: req.params,
    body: req.body
  });
  next();
});

router.get('/', async (req, res) => {
  try {
    console.log('API: Science Bowl Random Question - Processing request with query:', req.query);
    
    const subjects = req.query.subjects ? req.query.subjects.split(',') : [];
    console.log('API: Science Bowl Random Question - Parsed subjects:', subjects);
    
    const query = {
      subjects,
      competitions: req.query.competitions ? req.query.competitions.split(',') : [],
      excludeCompetitions: req.query.excludeCompetitions ? req.query.excludeCompetitions.split(',') : [],
      years: req.query.years ? req.query.years.split(',').map(Number) : [],
      isMcq: req.query.isMcq !== undefined ? req.query.isMcq === 'true' : undefined,
      isTossup: req.query.isTossup !== undefined ? req.query.isTossup === 'true' : undefined,
      number: parseInt(req.query.number) || 1
    };
    
    console.log('API: Science Bowl Random Question - Final query object:', query);
    
    const questions = await getRandomQuestions(query);
    console.log('API: Science Bowl Random Question - Found questions:', questions.length);
    
    if (questions.length === 0) {
      return res.status(404).json({ error: 'No questions found' });
    }
    
    res.json(questions);
  } catch (error) {
    console.error('API: Science Bowl Random Question - Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router; 
