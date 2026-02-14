// Answer validation utility functions

/**
 * Processes the answer to extract the main answer and any ACCEPT directives
 * @param {string} answer - The answer text to process
 * @returns {Object} Object containing the main answer and alternate answers
 */
function processAnswer(answer) {
    if (!answer) return { mainAnswer: '', alternateAnswers: [] };

    // Extract ACCEPT directives from parentheses
    const acceptRegex = /\(ACCEPT:\s*([^)]+)\)/gi;
    const alternateAnswers = [];
    let match;
    
    // Find all ACCEPT directives
    while ((match = acceptRegex.exec(answer)) !== null) {
        alternateAnswers.push(match[1].trim());
    }

    // Remove all ACCEPT directives from the main answer
    const mainAnswer = answer.replace(/\(ACCEPT:\s*[^)]+\)/gi, '').trim();

    return {
        mainAnswer,
        alternateAnswers
    };
}

/**
 * Normalizes text for comparison by:
 * - Converting to lowercase
 * - Removing punctuation
 * - Removing extra whitespace
 * - Removing articles (a, an, the)
 * @param {string} text - The text to normalize
 * @returns {string} The normalized text
 */
function normalizeText(text) {
    if (!text) return '';
    
    return text
        .toLowerCase()
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '') // Remove punctuation
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .trim()
        .replace(/\b(a|an|the)\b/g, '') // Remove articles
        .trim();
}

// Computes Damerau-Levenshtein distance (counts transpositions as a single edit)
function damerauLevenshtein(a, b) {
    const lenA = a.length;
    const lenB = b.length;
    const INF = lenA + lenB;
    const da = {};
    const score = Array.from({ length: lenA + 2 }, () => Array(lenB + 2).fill(0));

    score[0][0] = INF;
    for (let i = 0; i <= lenA; i++) {
        score[i + 1][0] = INF;
        score[i + 1][1] = i;
    }
    for (let j = 0; j <= lenB; j++) {
        score[0][j + 1] = INF;
        score[1][j + 1] = j;
    }

    for (let i = 1; i <= lenA; i++) {
        let db = 0;
        const aChar = a[i - 1];
        for (let j = 1; j <= lenB; j++) {
            const bChar = b[j - 1];
            const i1 = da[bChar] || 0;
            const j1 = db;
            const cost = aChar === bChar ? 0 : 1;
            if (cost === 0) db = j;

            score[i + 1][j + 1] = Math.min(
                score[i][j] + cost, // substitution
                score[i + 1][j] + 1, // insertion
                score[i][j + 1] + 1, // deletion
                score[i1][j1] + (i - i1 - 1) + 1 + (j - j1 - 1) // transposition
            );
        }
        da[aChar] = i;
    }

    return score[lenA + 1][lenB + 1];
}

// Determines allowed typo distance based on answer length and strictness (0-20)
function getTypoThreshold(length, strictness) {
    const clampedStrictness = Math.max(0, Math.min(20, strictness || 0));
    const base = length <= 4 ? 1 : length <= 10 ? 2 : 3;
    const penalty = Math.floor(clampedStrictness / 10); // reduces tolerance when strictness is high
    return Math.max(0, base - penalty);
}

/**
 * Checks if the user's answer matches the correct answer
 * @param {string} userAnswer - The answer provided by the user
 * @param {string} correctAnswer - The correct answer from the database
 * @param {number} strictness - Level of strictness in matching (0-20)
 * @returns {Object} Result object containing match status and details
 */
function validateAnswer(userAnswer, correctAnswer, strictness = 7) {
    if (!userAnswer || !correctAnswer) {
        return {
            isCorrect: false,
            reason: 'Missing answer'
        };
    }

    // Process the correct answer to get main answer and alternates
    const { mainAnswer, alternateAnswers } = processAnswer(correctAnswer);

    // Handle special case for single character/letter answers
    if (userAnswer.length === 1 && mainAnswer.length === 1) {
        const isCorrect = userAnswer.toLowerCase() === mainAnswer.toLowerCase() ||
            alternateAnswers.some(alt => alt.length === 1 && userAnswer.toLowerCase() === alt.toLowerCase());
        return {
            isCorrect,
            matchType: isCorrect ? 'exact' : 'none',
            userAnswer: userAnswer,
            correctAnswer: correctAnswer
        };
    }

    // Handle special case for numeric answers
    if (!isNaN(userAnswer) && !isNaN(mainAnswer)) {
        const isCorrect = userAnswer === mainAnswer ||
            alternateAnswers.some(alt => !isNaN(alt) && userAnswer === alt);
        return {
            isCorrect,
            matchType: isCorrect ? 'exact' : 'none',
            userAnswer: userAnswer,
            correctAnswer: correctAnswer
        };
    }

    const normalizedUserAnswer = normalizeText(userAnswer);
    const normalizedMainAnswer = normalizeText(mainAnswer);
    const normalizedAlternates = alternateAnswers.map(alt => normalizeText(alt));

    // Check against main answer
    if (normalizedUserAnswer === normalizedMainAnswer) {
        return {
            isCorrect: true,
            matchType: 'exact',
            userAnswer: userAnswer,
            correctAnswer: correctAnswer
        };
    }

    // Check against alternate answers
    for (const alt of normalizedAlternates) {
        if (normalizedUserAnswer === alt) {
            return {
                isCorrect: true,
                matchType: 'exact',
                userAnswer: userAnswer,
                correctAnswer: correctAnswer
            };
        }
    }

    // Handle multiple correct answers (separated by semicolons)
    const correctAnswers = normalizedMainAnswer.split(';').map(ans => ans.trim());
    
    // Check if user's answer matches any of the correct answers
    for (const answer of correctAnswers) {
        if (normalizedUserAnswer === answer) {
            return {
                isCorrect: true,
                matchType: 'exact',
                userAnswer: userAnswer,
                correctAnswer: correctAnswer
            };
        }
    }

    // Lenient typo handling using Damerau-Levenshtein distance
    const typoCandidates = new Set([normalizedMainAnswer, ...normalizedAlternates, ...correctAnswers]);
    for (const candidate of typoCandidates) {
        const threshold = getTypoThreshold(Math.max(normalizedUserAnswer.length, candidate.length), strictness);
        if (threshold === 0) continue;
        const distance = damerauLevenshtein(normalizedUserAnswer, candidate);
        if (distance <= threshold) {
            return {
                isCorrect: true,
                matchType: 'typo',
                userAnswer: userAnswer,
                correctAnswer: correctAnswer,
                distance,
                allowedDistance: threshold
            };
        }
    }

    // If strictness is very low, try word-by-word matching
    if (strictness < 5) {
        const userWords = new Set(normalizedUserAnswer.split(' '));
        const correctWords = new Set(normalizedMainAnswer.split(' '));
        
        // Calculate word overlap
        const commonWords = [...userWords].filter(word => correctWords.has(word));
        const overlapRatio = commonWords.length / Math.max(userWords.size, correctWords.size);
        
        if (overlapRatio > 0.7) { // 70% word overlap threshold
            return {
                isCorrect: true,
                matchType: 'word-overlap',
                userAnswer: userAnswer,
                correctAnswer: correctAnswer,
                overlapRatio: overlapRatio
            };
        }
    }

    return {
        isCorrect: false,
        matchType: 'none',
        userAnswer: userAnswer,
        correctAnswer: correctAnswer
    };
}

/**
 * Formats the validation result for display
 * @param {Object} result - The validation result object
 * @returns {string} Formatted result message
 */
function formatValidationResult(result) {
    if (result.isCorrect) {
        switch (result.matchType) {
            case 'exact':
                return 'Correct!';
            case 'word-overlap':
                return `Correct (${Math.round(result.overlapRatio * 100)}% match)!`;
            default:
                return 'Correct!';
        }
    } else {
        return `Incorrect. The correct answer was: ${result.correctAnswer}`;
    }
}

// Export the functions
export {
    validateAnswer,
    formatValidationResult,
    normalizeText,
    processAnswer
}; 
