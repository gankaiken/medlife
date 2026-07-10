export const config = {
  matcher: ['/health', '/agent/:path*', '/voice/:path*'],
};

function resolveBackendUrl(): string | null {
  const raw = process.env.MEDLIFE_BACKEND_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

export default async function middleware(request: Request): Promise<Response> {
  const backendUrl = resolveBackendUrl();
  if (!backendUrl) {
    return new Response('MEDLIFE_BACKEND_URL is not configured for this deployment.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const incoming = new URL(request.url);
  const target = backendUrl + incoming.pathname + incoming.search;

  const headers = new Headers(request.headers);
  const secret = process.env.BACKEND_SHARED_SECRET;
  if (secret) {
    headers.set('x-medlife-auth', secret);
  }
  headers.delete('host');

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  return fetch(target, init);
}
