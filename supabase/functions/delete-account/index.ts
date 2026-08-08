// delete-account: called by the app with the user's JWT. Deletes the auth
// user; every app table cascades from auth.users. Deploy with verify_jwt
// enabled — the JWT is additionally validated here via auth.getUser().

import { createAdminClient } from '../_shared/admin.ts';
import { getUserFromRequest } from '../_shared/auth.ts';
import { corsHeaders, json } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405, corsHeaders);

  const user = await getUserFromRequest(req);
  if (!user) return json({ error: 'unauthorized' }, 401, corsHeaders);

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error(`delete-account: failed for ${user.id}:`, error);
    return json({ error: 'deletion failed' }, 500, corsHeaders);
  }

  return json({ ok: true }, 200, corsHeaders);
});
