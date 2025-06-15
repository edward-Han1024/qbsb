import { scienceBowl } from '../databases.js';
import { SBCATEGORIES } from '../../quizbowl/categories.js';

/**
 * Get an array of random science bowl questions. This method is optimized for random selection.
 * @param {Object} object - an object containing the parameters
 * @param {string[]} [object.subjects] - an array of allowed subjects. Pass a 0-length array, null, or undefined to select any subject.
 * @param {string[]} [object.competitions] - an array of allowed competitions. Pass a 0-length array, null, or undefined to select any competition.
 * @param {string[]} [object.years] - an array of allowed years. Pass a 0-length array, null, or undefined to select any year.
 * @param {boolean} [object.isMcq] - filter by whether the question is multiple choice
 * @param {boolean} [object.isTossup] - filter by whether the question is a tossup
 * @param {number} [object.number=1] - how many random questions to return. Default: 1.
 * @returns {Promise<Array>} Array of random questions
 */
export async function getRandomQuestions(query) {
  console.log('getRandomQuestions: Received query:', query);
  
  // First, let's check what data we actually have
  const allQuestions = await scienceBowl.collection('questions').find({}).toArray();
  console.log('getRandomQuestions: Sample of questions in database:', allQuestions.slice(0, 2));
  console.log('getRandomQuestions: Total questions in database:', allQuestions.length);
  
  // Extract parameters without default values to preserve undefined
  const subjects = query.subjects;
  const competitions = query.competitions;
  const years = query.years;
  const isMcq = query.isMcq;
  const isTossup = query.isTossup;
  const number = query.number;
  console.log('getRandomQuestions: Parsed parameters:', { subjects, competitions, years, isMcq, isTossup, number });

  const matchStage = {};
  
  if (subjects && subjects.length > 0) {
    matchStage.subject = { $in: subjects };
  }
  
  if (competitions && competitions.length > 0) {
    matchStage.competition = { $in: competitions };
  }
  
  if (years && years.length > 0) {
    matchStage.year = { $in: years };
  }
  
  if (isMcq !== undefined) {
    matchStage.is_mcq = isMcq;
  }
  
  // Only apply is_tossup filter if other filters are present
  // if (isTossup !== undefined && Object.keys(matchStage).length > 0) {
  //   matchStage.is_tossup = isTossup;
  // }

  console.log('getRandomQuestions: Final match stage:', JSON.stringify(matchStage, null, 2));

  const pipeline = [
    { $match: matchStage },
    { $sample: { size: number || 1 } }
  ];

  console.log('getRandomQuestions: Full aggregation pipeline:', JSON.stringify(pipeline, null, 2));

  try {
    const questions = await scienceBowl.collection('questions').aggregate(pipeline).toArray();
    console.log('getRandomQuestions: Found questions:', questions.length);
    if (questions.length === 0) {
      console.log('getRandomQuestions: No questions found with the given criteria');
      // Let's check what questions we have for these subjects
      const subjectQuestions = await scienceBowl.collection('questions')
        .find({ subject: { $in: subjects } })
        .toArray();
      console.log('getRandomQuestions: Questions found for subjects (without other filters):', subjectQuestions.length);
      if (subjectQuestions.length > 0) {
        console.log('getRandomQuestions: Sample of questions for these subjects:', subjectQuestions.slice(0, 2));
      }
    }
    return questions;
  } catch (error) {
    console.error('getRandomQuestions: Error executing query:', error);
    throw error;
  }
}

export default getRandomQuestions; 