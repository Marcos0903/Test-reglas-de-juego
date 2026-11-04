import { getStore } from '@netlify/blobs';
import { admin, getUser } from '@netlify/identity';

const store = getStore({ name: 'referee-progress', region: 'eu-central-1', consistency: 'strong' });
const GROUPS_KEY = 'tracking-groups';
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

function validOrigin(request) {
  return request.headers.get('origin') === new URL(request.url).origin;
}

export default async request => {
  const requester = await getUser();
  if (!requester) return json({ error: 'Inicia sesión para continuar.' }, 401);
  if (!requester.roles?.includes('admin')) return json({ error: 'Solo una persona administradora puede modificar los grupos.' }, 403);

  if (request.method === 'GET') {
    return json({ groups: await store.get(GROUPS_KEY, { type: 'json' }) || [] });
  }
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  if (!validOrigin(request)) return json({ error: 'Origen no autorizado.' }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'La solicitud no tiene un formato válido.' }, 400); }
  if (!Array.isArray(body?.groups) || body.groups.length > 100) {
    return json({ error: 'La lista de grupos no es válida.' }, 400);
  }

  const accounts = await admin.listUsers();
  const validUserIds = new Set(accounts.map(account => (account.user || account).id));
  const seenGroupIds = new Set();
  const groups = [];
  for (const group of body.groups) {
    const id = typeof group?.id === 'string' && group.id.length <= 80 ? group.id : '';
    const name = typeof group?.name === 'string' ? group.name.trim() : '';
    const userIds = group?.userIds;
    if (!id || seenGroupIds.has(id) || !name || name.length > 60 || !Array.isArray(userIds) || userIds.length > validUserIds.size ||
        userIds.some(userId => typeof userId !== 'string' || !validUserIds.has(userId)) || new Set(userIds).size !== userIds.length) {
      return json({ error: 'Hay un grupo o integrante no válido. Comprueba los nombres y las cuentas seleccionadas.' }, 400);
    }
    seenGroupIds.add(id);
    groups.push({ id, name, userIds });
  }

  await store.set(GROUPS_KEY, JSON.stringify(groups));
  return json({ groups });
};

