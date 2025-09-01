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

    res.json({ explanation, model: data.model, usage: data.usage });
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

export default router;
