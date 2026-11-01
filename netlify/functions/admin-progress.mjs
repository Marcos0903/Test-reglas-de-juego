import { getStore } from '@netlify/blobs';
import { admin, getUser } from '@netlify/identity';

const store = getStore({ name: 'referee-progress', region: 'eu-central-1', consistency: 'strong' });
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

async function getHistory(userId) {
  const { blobs } = await store.list({ prefix: `attempt:${userId}:` });
  const results = await Promise.all(blobs.map(blob => store.get(blob.key, { type: 'json' })));
  return results.filter(Boolean).sort((a, b) => b.date.localeCompare(a.date));
}

export default async () => {
  const requester = await getUser();
  if (!requester) return json({ error: 'Inicia sesión para continuar.' }, 401);
  if (!requester.roles?.includes('admin')) return json({ error: 'No tienes permiso para consultar el seguimiento.' }, 403);

  const accounts = await admin.listUsers();
  const users = await Promise.all(accounts.map(async account => {
    const user = account.user || account;
    const history = await getHistory(user.id);
    const wrongIds = new Set();
    for (const attempt of [...history].reverse()) {
      for (const id of attempt.wrongIds || []) wrongIds.add(id);
      for (const id of attempt.correctIds || []) wrongIds.delete(id);
    }
    const scores = history.map(attempt => attempt.score);
    return {
      id: user.id,
      name: user.userMetadata?.full_name || user.email?.split('@')[0] || 'Árbitro',
      email: user.email || '',
      examCount: history.length,
      average: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null,
      best: scores.length ? Math.max(...scores) : null,
      wrongCount: wrongIds.size,
      history: history.slice(0, 50)
    };
  }));
  users.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return json({ users });
};

