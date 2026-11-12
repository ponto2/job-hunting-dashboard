/**
 * 認証ユーティリティ
 * HMAC-SHA256でセッショントークンを署名・検証する
 *
 * 署名鍵は AUTH_SECRET を使い、未設定なら従来どおり AUTH_PASSWORD を使う。
 * AUTH_SECRET を分けておくと、鍵を変えるだけで発行済みの全セッションを
 * 無効にでき、パスワードそのものを鍵として使わずに済む。
 */

const COOKIE_NAME = 'session';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7日間

/** TextEncoderでUint8Arrayに変換 */
function encode(str) {
  return new TextEncoder().encode(str);
}

/** HMAC-SHA256キーをインポート */
async function importKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/** バイト配列をhexに変換 */
function bufToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** hexをUint8Arrayに戻す */
function hexToBuf(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return arr;
}

/** セッション署名に使う鍵 */
export function getSigningSecret() {
  return process.env.AUTH_SECRET || process.env.AUTH_PASSWORD || '';
}

/** 任意の文字列を署名鍵でHMACし、hexで返す（ログイン試行の記録などに使う） */
export async function hmacHex(value) {
  const secret = getSigningSecret();
  if (!secret) throw new Error('AUTH_PASSWORD が設定されていません');
  const key = await importKey(secret);
  return bufToHex(await crypto.subtle.sign('HMAC', key, encode(value)));
}

/**
 * セッショントークンを生成する
 * フォーマット: "<expiry_ts>.<hmac_hex>"
 */
export async function createSessionToken() {
  if (!getSigningSecret()) throw new Error('AUTH_PASSWORD が設定されていません');

  const expiry = Date.now() + SESSION_DURATION_MS;
  return `${expiry}.${await hmacHex(String(expiry))}`;
}

/**
 * セッショントークンを検証する
 * @returns {boolean} 有効ならtrue
 */
export async function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return false;

  const secret = getSigningSecret();
  if (!secret) return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [expiryStr, sigHex] = parts;
  const expiry = Number(expiryStr);

  // 有効期限チェック
  if (!/^\d+$/.test(expiryStr) || Date.now() > expiry) return false;
  if (!/^[0-9a-f]{64}$/.test(sigHex)) return false;

  // HMAC署名検証（crypto.subtle.verify は定数時間で比較する）
  try {
    const key = await importKey(secret);
    return await crypto.subtle.verify('HMAC', key, hexToBuf(sigHex), encode(expiryStr));
  } catch {
    return false;
  }
}

/**
 * パスワードを検証する
 * 両方をSHA-256にそろえてから全バイトを比較するので、入力の長さや
 * 一致した位置によって処理時間が変わらない。
 */
export async function verifyPassword(inputPassword) {
  const correct = process.env.AUTH_PASSWORD;
  if (!correct || typeof inputPassword !== 'string') return false;
  const [input, expected] = await Promise.all([
    crypto.subtle.digest('SHA-256', encode(inputPassword)),
    crypto.subtle.digest('SHA-256', encode(correct)),
  ]);
  const a = new Uint8Array(input);
  const b = new Uint8Array(expected);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Cookieにセッションを設定するためのSet-Cookieヘッダー文字列を生成
 */
export async function buildSetCookieHeader() {
  const token = await createSessionToken();
  const maxAge = Math.floor(SESSION_DURATION_MS / 1000);
  // Vercel (HTTPS) では Secure を付ける。ローカル開発でも動作するよう NODE_ENV で分岐
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

/**
 * Cookieを削除するSet-Cookieヘッダー文字列を生成
 */
export function buildDeleteCookieHeader() {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

/**
 * リクエストのCookieからセッショントークンを取り出して検証する
 * @param {Request} request
 * @returns {Promise<boolean>}
 */
export async function isAuthenticated(request) {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  const token = match ? match[1] : null;
  return verifySessionToken(token);
}
