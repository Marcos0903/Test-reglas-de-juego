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
  if (!Number.isInteger(correct) || correct < 0 || correct > 25 ||
      !Number.isInteger(seconds) || seconds < 0 || seconds > 1500 ||
      !Array.isArray(wrongIds) || wrongIds.length > 25 ||
      !Array.isArray(correctIds) || correctIds.length > 25 ||
      wrongIds.length + correctIds.length !== 25 || correctIds.length !== correct ||
      [...wrongIds, ...correctIds].some(id => typeof id !== 'string' || !/^\d+\.\d+$/.test(id)) ||
      new Set([...wrongIds, ...correctIds]).size !== wrongIds.length + correctIds.length) {
    return json({ error: 'El resultado del examen no es válido.' }, 400);
  }

  const attemptId = `${Date.now().toString(36)}-${crypto.randomUUID()}`;
  const record = {
    date: new Date().toISOString(),
    score: correct * 4,
    correct,
    passed: correct >= 21,
    seconds,
    wrongIds,
    correctIds
  };
  await store.set(`attempt:${user.id}:${attemptId}`, JSON.stringify(record));
  return json({ saved: true, attempt: record }, 201);
};

