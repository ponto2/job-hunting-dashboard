import { createClient } from '@supabase/supabase-js';
import { configError } from '@/lib/api-response';

let supabaseClient;

// All database access goes through the authenticated API routes. The service
// role key stays on the server and bypasses RLS, so the tables can deny every
// direct request made with the public anon key.
export function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    const missing = [
      !supabaseUrl && 'NEXT_PUBLIC_SUPABASE_URL',
      !serviceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY',
    ].filter(Boolean).join(' / ');
    throw configError(`サーバー設定エラー: ${missing} が設定されていません`);
  }

  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return supabaseClient;
}
