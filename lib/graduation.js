// The graduation year the user is job hunting for, e.g. "28" for 28卒. The AI
// research prompt uses it to look for that year's recruiting page; screens do
// not show it, so the labels read the same for any year. It is read at build
// time, so changing it needs a redeploy. Defaults to the year the app was
// originally built for. (The NEXT_PUBLIC_ name is kept so existing settings
// keep working.)
const configured = process.env.NEXT_PUBLIC_GRADUATION_YEAR;

export const GRADUATION_YEAR = /^\d{2}$/.test(configured || '') ? configured : '28';
export const GRADUATION_LABEL = `${GRADUATION_YEAR}卒`;
export const GRADUATION_FULL_YEAR = `20${GRADUATION_YEAR}`;
