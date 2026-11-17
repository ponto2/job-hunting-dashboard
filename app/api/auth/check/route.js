import { NextResponse } from 'next/server';
import {
  buildSetCookieHeader, readSessionToken, sessionNeedsRenewal, verifySessionToken,
} from '@/lib/auth';

export async function GET(request) {
  const token = readSessionToken(request);
  if (!(await verifySessionToken(token))) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const response = NextResponse.json({ authenticated: true });
  // Opening the app keeps the session alive: a session older than a day is
  // reissued with a fresh expiry.
  if (sessionNeedsRenewal(token)) {
    response.headers.set('Set-Cookie', await buildSetCookieHeader());
  }
  return response;
}
