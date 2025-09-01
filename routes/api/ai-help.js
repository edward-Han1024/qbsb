import { Router } from 'express';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiting for AI help requests (more restrictive since they cost money)
const aiHelpRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Limit each IP to 5 requests per minute
  message: 'Too many AI help requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

router.use(aiHelpRateLimit);

// Health check to verify route is mounted and API key presence
router.get('/health', (_req, res) => {
  res.json({ ok: true, hasApiKey: !!process.env.OPENAI_API_KEY });
});

router.post('/explain', async (req, res) => {
  try {
    const { question, answer, category, options, isMcq } = req.body;

    if (!question || !answer) {
      return res.status(400).json({ error: 'Question and answer are required' });
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    const hasOptions = Array.isArray(options) && options.length > 0;
    const optionsText = hasOptions ? `\nOptions:\n${options.map((opt) => `${opt}`).join('\n')}` : '';

    const prompt = `You are a helpful science tutor. A student is asking for help understanding a Science Bowl question.

Question: ${question}
Correct Answer: ${answer}
Category: ${category || 'Science'}${optionsText}

Please provide a clear, educational explanation that:
1. Explains the scientific concept(s) involved
2. Helps the student understand why the correct answer is correct
3. Provides additional context helpful for similar questions
4. Uses language appropriate for high school students
5. Is concise but thorough (aim for about 2 paragraphs)

${hasOptions || isMcq ? `Also, a short section titled "Why the other options are wrong:" with one bullet per incorrect option. For each, briefly (1 sentence) explain the misconception or why it does not apply. Use the option letter and text if provided.` : ''}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a helpful science tutor who explains Science Bowl questions clearly and educationally.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 500,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('OpenAI API error (explain):', errorData);
      return res.status(500).json({ error: 'Failed to get AI explanation', details: errorData.error?.message || 'Unknown error' });
    }

    const data = await response.json();
    const explanation = data.choices?.[0]?.message?.content;
    if (!explanation) {
      return res.status(500).json({ error: 'No explanation received from AI' });
    }

    // Verification/refinement step: ask the model to check accuracy and fix issues
    let finalExplanation = explanation;
    try {
      const verifyPrompt = `Review the following explanation for scientific accuracy, clarity, and alignment with the correct answer${hasOptions ? ' and the provided multiple-choice options' : ''}. If there are inaccuracies or unclear parts, correct them. Keep the format readable for high-school students. If a section "Why the other options are wrong" is present, keep it and correct any mistaken bullets.

Question: ${question}
Correct Answer: ${answer}
Category: ${category || 'Science'}${optionsText}

Explanation to review:\n\n${explanation}

Return only the final corrected explanation text. Do not include any extra commentary, JSON, or markdown fences.`;

      const verifyResp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You carefully verify science explanations and output only the corrected explanation text.' },
            { role: 'user', content: verifyPrompt }
          ],
          max_tokens: 600,
          temperature: 0.2
        })
      });

      if (verifyResp.ok) {
        const verifyData = await verifyResp.json();
        const corrected = verifyData.choices?.[0]?.message?.content?.trim();
        if (corrected) { finalExplanation = corrected; }
      }
    } catch (err) {
      console.warn('Explanation verification step failed; returning original text:', err?.message || err);
    }

    res.json({ explanation: finalExplanation, model: data.model, usage: data.usage });
  } catch (error) {
    console.error('AI help error (explain):', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Suggested reading endpoint
router.post('/suggest-reading', async (req, res) => {
  try {
    const { question, answer, category } = req.body;
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    const prompt = `You are a helpful science tutor. Suggest high-quality reading to study the concepts required to answer a Science Bowl question.

Question: ${question}
Category: ${category || 'Science'}
Known correct answer (may help infer subtopic): ${answer || 'N/A'}

Return 5-7 resources balanced between:
- Standard high-school or intro-college textbooks (include edition if useful)
- Authoritative open resources (Khan Academy, HyperPhysics, PhET, MIT OCW, NASA, NOAA, NIH, etc.)
- Topic-specific references (review articles or reputable encyclopedias)

Output strict JSON with the following shape, no extra commentary:
{
  "suggestions": [
    { "title": "...", "type": "textbook|video|article|course|simulation", "link": "https://...", "notes": "1-2 sentence why relevant" }
  ]
}

Prefer stable, non-paywalled links when possible.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You recommend concise, reputable study resources with accurate links.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 600,
        temperature: 0.6
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('OpenAI API error (suggest-reading):', errorData);
      return res.status(500).json({ error: 'Failed to get suggestions', details: errorData.error?.message || 'Unknown error' });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { suggestions: [{ title: 'Suggested Reading', type: 'list', link: '', notes: content.trim() }] };
    }

    if (!parsed || !Array.isArray(parsed.suggestions)) {
      return res.status(500).json({ error: 'Invalid response format from AI' });
    }

    res.json({ suggestions: parsed.suggestions, model: data.model, usage: data.usage });
  } catch (error) {
    console.error('AI suggest-reading error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Extra practice endpoint: returns practice questions with answers and explanations
router.post('/extra-practice', async (req, res) => {
  try {
    const { question, answer, category } = req.body;
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    // Prompt from log.txt with added structure requirement
    const basePrompt = `Based off this question, create a list of 3 questions that are of the same core concept as this question. Try to come up with creative questions that would challenge understanding.
Each question should be of the format of Science Bowl High School questions.
For each question, provide an answer and an explanation.`;

    const prompt = `${basePrompt}

Original Question: ${question}
Category: ${category || 'Science'}
Known correct answer (for context): ${answer || 'N/A'}

Output strict JSON with this shape and no extra commentary:
{
  "problems": [
    { "question": "...", "answer": "...", "explanation": "..." }
  ]
}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You write rigorous, concise practice questions in official Science Bowl HS style with accurate answers and explanations.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 900,
        temperature: 0.6
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('OpenAI API error (extra-practice):', errorData);
      return res.status(500).json({ error: 'Failed to get practice questions', details: errorData.error?.message || 'Unknown error' });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { problems: [] };
    }

    if (!parsed || !Array.isArray(parsed.problems) || parsed.problems.length === 0) {
      return res.status(500).json({ error: 'Invalid response format from AI' });
    }

    // Verification step: ask the model to check and fix any issues, returning corrected JSON
    let verifiedProblems = parsed.problems;
    try {
      const verifyPrompt = `You are reviewing practice questions for factual accuracy and clarity in the Science Bowl High School style. 

Original Question (context): ${question}
Category: ${category || 'Science'}
Known correct answer (context): ${answer || 'N/A'}

Generated practice set JSON to verify (problems array):\n${JSON.stringify(parsed.problems)}

Tasks:
1. Check each problem's scientific accuracy, internal consistency, and alignment with the core concept of the original question.
2. Ensure the answer matches the question and the explanation supports the answer.
3. Fix any errors, ambiguities, or non–Science Bowl style wording.
4. Keep the number of problems the same.
5. Do NOT introduce references or URLs. Do NOT add commentary.

Return strict JSON with the exact schema:
{ "problems": [ { "question": "...", "answer": "...", "explanation": "..." } ] }`;

      const verifyResp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You carefully verify science content for correctness and return corrected JSON only.' },
            { role: 'user', content: verifyPrompt }
          ],
          max_tokens: 900,
          temperature: 0.2
        })
      });

      if (verifyResp.ok) {
        const verifyData = await verifyResp.json();
        const verifyContent = verifyData.choices?.[0]?.message?.content || '';
        try {
          const verifiedParsed = JSON.parse(verifyContent);
          if (verifiedParsed && Array.isArray(verifiedParsed.problems) && verifiedParsed.problems.length === verifiedProblems.length) {
            verifiedProblems = verifiedParsed.problems;
          }
        } catch {
          // If parse fails, keep original problems
        }
      }
    } catch (err) {
      console.warn('Verification step failed; returning original problems:', err?.message || err);
    }

    res.json({ problems: verifiedProblems, model: data.model, usage: data.usage });
  } catch (error) {
    console.error('AI extra-practice error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

export default router;
