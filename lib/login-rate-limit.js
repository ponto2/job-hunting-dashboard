// Limits password guessing: after MAX_FAILED_ATTEMPTS failures from one client
// within WINDOW_MINUTES, further logins from that client are refused until the
// window passes. Attempts are stored in the login_attempts table so the limit
// holds across serverless instances.
//
// Every function fails open: if the table is missing (migration not applied)
// or the database is unreachable, login keeps working without the limit
// rather than locking the owner out.

export const MAX_FAILED_ATTEMPTS = 10;
export const WINDOW_MINUTES = 15;
const RETENTION_HOURS = 24;

// Vercel sets these headers itself; elsewhere they may be absent.
export function getClientAddress(request) {
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return 'unknown';
}

function warn(action, error) {
  console.warn(`login rate limit: could not ${action}; continuing without the limit.`, error?.message || error);
}

export async function isLoginBlocked(supabase, clientKey, now = new Date()) {
  if (!supabase) return false;
  try {
    const since = new Date(now.getTime() - WINDOW_MINUTES * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from('login_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('client_key', clientKey)
      .gte('attempted_at', since);
    if (error) {
      warn('read attempts', error);
      return false;
    }
    return (count || 0) >= MAX_FAILED_ATTEMPTS;
  } catch (error) {
    warn('read attempts', error);
    return false;
  }
}

export async function recordFailedLogin(supabase, clientKey, now = new Date()) {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('login_attempts').insert({ client_key: clientKey });
    if (error) {
      warn('record an attempt', error);
      return;
    }
    // Keep the table small; old attempts no longer affect the limit.
    const cutoff = new Date(now.getTime() - RETENTION_HOURS * 60 * 60 * 1000).toISOString();
    await supabase.from('login_attempts').delete().lt('attempted_at', cutoff);
  } catch (error) {
    warn('record an attempt', error);
  }
}

export async function clearFailedLogins(supabase, clientKey) {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('login_attempts').delete().eq('client_key', clientKey);
    if (error) warn('clear attempts', error);
  } catch (error) {
    warn('clear attempts', error);
  }
}
