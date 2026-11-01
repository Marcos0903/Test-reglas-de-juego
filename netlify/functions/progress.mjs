import { getStore } from '@netlify/blobs';
import { getUser } from '@netlify/identity';

const store = getStore({ name: 'referee-progress', region: 'eu-central-1', consistency: 'strong' });
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

function validOrigin(request) {
  return request.headers.get('origin') === new URL(request.url).origin;
}

async function getHistory(userId) {
  const { blobs } = await store.list({ prefix: `attempt:${userId}:` });
  const results = await Promise.all(blobs.map(blob => store.get(blob.key, { type: 'json' })));
  return results.filter(Boolean).sort((a, b) => b.date.localeCompare(a.date));
}

export default async request => {
  const user = await getUser();
  if (!user) return json({ error: 'Inicia sesión para continuar.' }, 401);

  if (request.method === 'GET') {
    const history = await getHistory(user.id);
    const wrongIds = new Set();
    for (const attempt of [...history].reverse()) {
      for (const id of attempt.wrongIds) wrongIds.add(id);
      for (const id of attempt.correctIds) wrongIds.delete(id);
    }
    return json({ name: user.userMetadata?.full_name || user.email?.split('@')[0] || 'Árbitro', history, wrongIds: [...wrongIds] });
  }

  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  if (!validOrigin(request)) return json({ error: 'Origen no autorizado.' }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'La solicitud no tiene un formato válido.' }, 400); }
  const attempt = body?.attempt;
  const wrongIds = attempt?.wrongIds;
  const correctIds = attempt?.correctIds;
  const correct = attempt?.correct;
  const seconds = attempt?.seconds;
  const questionCount = attempt?.questionCount;
  const mode = attempt?.mode;
  const ruleNumber = attempt?.ruleNumber;
  const timeLimitSeconds = attempt?.timeLimitSeconds;
  const supportedCounts = [4, 5, 10, 15, 20, 25, 30, 40, 50];
  const supportedTimes = [600, 900, 1200, 1500, 1800, 2100, 2700, 3600];
  const validRuleMode = mode === 'rule' && supportedCounts.includes(questionCount) &&
    Number.isInteger(ruleNumber) && ruleNumber >= 1 && ruleNumber <= 18 &&
    (timeLimitSeconds === 0 ? seconds <= 86400 : supportedTimes.includes(timeLimitSeconds) && seconds <= timeLimitSeconds);
  const validMode = mode === 'official'
    ? questionCount === 25 && timeLimitSeconds === 2100 && seconds <= timeLimitSeconds
    : mode === 'timed'
      ? supportedCounts.includes(questionCount) && supportedTimes.includes(timeLimitSeconds) && seconds <= timeLimitSeconds
      : (mode === 'untimed' && supportedCounts.includes(questionCount) && timeLimitSeconds === 0) || validRuleMode;
  const resultIds = [...(Array.isArray(wrongIds) ? wrongIds : []), ...(Array.isArray(correctIds) ? correctIds : [])];
  const idsBelongToRule = mode !== 'rule' || resultIds.every(id => typeof id === 'string' && id.startsWith(`${ruleNumber}.`));
  if (!Number.isInteger(questionCount) || !supportedCounts.includes(questionCount) ||
      !Number.isInteger(correct) || correct < 0 || correct > questionCount ||
      !Number.isInteger(seconds) || seconds < 0 || seconds > 86400 || !validMode ||
      !Array.isArray(wrongIds) || wrongIds.length > questionCount ||
      !Array.isArray(correctIds) || correctIds.length > questionCount ||
      wrongIds.length + correctIds.length !== questionCount || correctIds.length !== correct ||
      !idsBelongToRule ||
      [...wrongIds, ...correctIds].some(id => typeof id !== 'string' || !/^\d+\.\d+$/.test(id)) ||
      new Set([...wrongIds, ...correctIds]).size !== wrongIds.length + correctIds.length) {
    return json({ error: 'El resultado del examen no es válido.' }, 400);
  }

  const attemptId = `${Date.now().toString(36)}-${crypto.randomUUID()}`;
  const record = {
    date: new Date().toISOString(),
    score: Math.round(correct * 100 / questionCount),
    correct,
    passed: correct >= Math.ceil(questionCount * 0.84),
    seconds,
    questionCount,
    mode,
    ruleNumber: mode === 'rule' ? ruleNumber : null,
    timeLimitSeconds,
    wrongIds,
    correctIds
  };
  await store.set(`attempt:${user.id}:${attemptId}`, JSON.stringify(record));
  return json({ saved: true, attempt: record }, 201);
};
