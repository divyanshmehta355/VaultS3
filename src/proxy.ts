import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  
  // If no password is set in the environment, skip authentication entirely
  if (!password) {
    return NextResponse.next();
  }

  const authCookie = request.cookies.get('file_manager_auth');
  const isAuthenticated = authCookie?.value === 'authenticated';

  const isAuthRoute = request.nextUrl.pathname.startsWith('/api/auth') || request.nextUrl.pathname === '/login';

  if (!isAuthenticated && !isAuthRoute) {
    // Redirect to login for pages, return 401 for APIs
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (isAuthenticated && request.nextUrl.pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
