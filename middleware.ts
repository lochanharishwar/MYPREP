import { NextResponse, type NextRequest } from 'next/server';
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );
  if (request.nextUrl.protocol === 'https:')
    response.headers.set('Strict-Transport-Security', 'max-age=31536000');
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; media-src 'self' https: blob:; connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co" +
      (process.env.NODE_ENV === 'development'
        ? ' ws: http://localhost:*'
        : '') +
      "; font-src 'self' data:; frame-src 'none'",
  );
  return response;
}
export const config = { matcher: ['/((?!_next/static|favicon.svg).*)'] };
