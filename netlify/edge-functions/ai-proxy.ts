// Netlify Edge Function: pass-through proxy to the project's AI Gateway.
// Deploy at netlify/edge-functions/ai-proxy.ts

export default async (req: Request, _ctx: any) => {
  const GATEWAY_KEY = Deno.env.get('NETLIFY_AI_GATEWAY_KEY') || '';
  const PROXY_SECRET = Deno.env.get('PROXY_SECRET') || '';

  if (PROXY_SECRET && req.headers.get('x-proxy-secret') !== PROXY_SECRET) {
    return new Response(JSON.stringify({ error: { message: 'unauthorized' } }), {
      status: 401, headers: { 'content-type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/ai/, '');
  const upstream = `${url.origin}/.netlify/ai${path}${url.search}`;

  const headers: Record<string, string> = {
    authorization: `Bearer ${GATEWAY_KEY}`,
    'x-api-key': GATEWAY_KEY,
    'content-type': req.headers.get('content-type') || 'application/json',
    accept: req.headers.get('accept') || 'application/json',
  };
  const anth = req.headers.get('anthropic-version');
  if (anth) headers['anthropic-version'] = anth;

  const init: RequestInit = { method: req.method, headers };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    // Intercept JSON body to convert legacy max_tokens -> max_completion_tokens
    try {
      const bodyText = await req.text();
      const bodyJson = JSON.parse(bodyText);
      if (bodyJson && typeof bodyJson === 'object') {
        if ('max_tokens' in bodyJson && !('max_completion_tokens' in bodyJson)) {
          bodyJson.max_completion_tokens = bodyJson.max_tokens;
          delete bodyJson.max_tokens;
        }
      }
      init.body = JSON.stringify(bodyJson);
    } catch (_e) {
      // fallback to raw body if not JSON
      init.body = req.body;
      // @ts-ignore duplex is required for streamed request bodies in Deno
      init.duplex = 'half';
    }
  }

  const r = await fetch(upstream, init);
  return new Response(r.body, {
    status: r.status,
    headers: {
      'content-type': r.headers.get('content-type') || 'application/json',
      'cache-control': 'no-store',
      'x-gateway-status': String(r.status),
    },
  });
};

export const config = { path: "/ai/*" };
