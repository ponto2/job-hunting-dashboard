import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';

export function jsonError(message, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function requireAuth(request) {
  return (await isAuthenticated(request))
    ? null
    : jsonError('認証が必要です', 401);
}

export function supabaseError(error) {
  return jsonError(error.message, 500);
}

// An error whose message is safe and useful to show in the UI, such as a
// missing environment variable.
export function configError(message) {
  const error = new Error(message);
  error.publicMessage = message;
  return error;
}

// Route handlers must always answer with JSON. Without this, an exception
// becomes Next.js's HTML error page and the client can only show a generic
// "request failed" message.
export function withApi(handler) {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (error?.name === 'SyntaxError') {
        return jsonError('リクエストの形式が正しくありません', 400);
      }
      console.error(error);
      return jsonError(error?.publicMessage || 'サーバーでエラーが発生しました', 500);
    }
  };
}
