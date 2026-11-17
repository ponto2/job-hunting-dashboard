import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth';
import LoginForm from './LoginForm';

// A bookmark or shared link to /login must not ask for the password again
// while the session is still valid.
export default async function LoginPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (await verifySessionToken(token)) redirect('/');
  return <LoginForm />;
}
