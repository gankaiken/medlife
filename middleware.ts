export const config = {
  matcher: ['/agent/:path*', '/voice/:path*'],
};

const BACKEND_URL = 'https://grand-rounds-backend.onrender.com';

export default async function middleware(request: Request): Promise<Response> {
  const incoming = new URL(request.url);
  const target = BACKEND_URL + incoming.pathname + incoming.search;

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

