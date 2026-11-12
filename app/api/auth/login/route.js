import { verifyPassword, buildSetCookieHeader, hmacHex } from '@/lib/auth';
import { jsonError } from '@/lib/api-response';
import { getSupabase } from '@/lib/supabase';
import {
  WINDOW_MINUTES, clearFailedLogins, getClientAddress, isLoginBlocked, recordFailedLogin,
} from '@/lib/login-rate-limit';

// The rate limit is a safeguard, not a requirement: without a database
// connection, login still works.
function getRateLimitClient() {
  try {
    return getSupabase();
  } catch (error) {
    console.warn('login rate limit disabled:', error.message);
    return null;
  }
}

export async function POST(request) {
  try {
    if (!process.env.AUTH_PASSWORD) {
      console.error('AUTH_PASSWORD is not configured');
      return jsonError('認証設定が不足しています', 500);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError('リクエストの形式が正しくありません', 400);
    }
    const password = body?.password;
    if (typeof password !== 'string' || !password) {
      return jsonError('パスワードを入力してください', 400);
    }

    const supabase = getRateLimitClient();
    // IP addresses are stored only as keyed hashes.
    const clientKey = await hmacHex(`login:${getClientAddress(request)}`);

    if (await isLoginBlocked(supabase, clientKey)) {
      return jsonError(`ログインの失敗が続いたため、一時的にログインを制限しています。${WINDOW_MINUTES}分ほど待ってから再度お試しください`, 429);
    }

    if (!(await verifyPassword(password))) {
      await recordFailedLogin(supabase, clientKey);
      return jsonError('パスワードが正しくありません', 401);
    }

    await clearFailedLogins(supabase, clientKey);
    const setCookie = await buildSetCookieHeader();

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': setCookie,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return jsonError('ログインに失敗しました', 500);
  }
}
