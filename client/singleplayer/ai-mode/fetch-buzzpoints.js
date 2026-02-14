const cache = new Map();

function normalizeQuestionId(id) {
  if (id === null || id === undefined) return null;
  if (typeof id === 'string' || typeof id === 'number') return String(id);
  if (typeof id?.toHexString === 'function') return id.toHexString();
  if (typeof id?.toString === 'function') {
    const str = id.toString();
    if (str && str !== '[object Object]') return str;
  }
  if (typeof id?.$oid === 'string') return id.$oid;
  return null;
}

function buildCacheKey(questionId, level) {
  return `${questionId}:${level}`;
}

/**
 * Fetch precomputed buzzpoints for a question/difficulty.
 * @param {object} params
 * @param {string} params.questionId
 * @param {'beginner'|'advanced'} params.level
 * @returns {Promise<{wordIndex: number, probCorrect: number} | null>}
 */
export default async function fetchBuzzpoints({ questionId, level }) {
  const normalizedId = normalizeQuestionId(questionId);
  console.debug('[AI-BUZZ][fetch] input', { questionId, normalizedId, level });
  if (!normalizedId || !level) return null;
  const key = buildCacheKey(normalizedId, level);
  if (cache.has(key)) return cache.get(key);

  try {
    console.debug('[AI-BUZZ][fetch] request', { key });
    const response = await fetch(`/api/ai-buzz/${encodeURIComponent(normalizedId)}?level=${encodeURIComponent(level)}`);
    if (!response.ok) {
      console.warn('[AI-BUZZ][fetch] non-200', { status: response.status, key });
      cache.set(key, null);
      return null;
    }

    const data = await response.json();
    console.debug('[AI-BUZZ][fetch] response', { key, status: response.status, data });
    const prediction = data.prediction || data.predictions?.[level];
    if (!prediction || !Number.isFinite(prediction.wordIndex) || !Number.isFinite(prediction.probCorrect)) {
      console.warn('[AI-BUZZ][fetch] invalid prediction', { key, prediction });
      cache.set(key, null);
      return null;
    }

    const cleaned = {
      wordIndex: Math.max(1, Math.floor(prediction.wordIndex)),
      probCorrect: Math.min(Math.max(prediction.probCorrect, 0), 1),
      phrase: typeof prediction.phrase === 'string' ? prediction.phrase.trim() : ''
    };
    cache.set(key, cleaned);
    console.debug('[AI-BUZZ][fetch] cleaned', { key, cleaned });
    return cleaned;
  } catch (error) {
    console.warn('Failed to fetch buzzpoints', error);
    cache.set(key, null);
    return null;
  }
}
