// The graduation year the user is job hunting for, e.g. "28" for 28卒.
// NEXT_PUBLIC_ makes it available to both the AI research prompt (server) and
// the card labels (browser). It is read at build time, so changing it needs a
// redeploy. Defaults to the year the app was originally built for.
const configured = process.env.NEXT_PUBLIC_GRADUATION_YEAR;

export const GRADUATION_YEAR = /^\d{2}$/.test(configured || '') ? configured : '28';
export const GRADUATION_LABEL = `${GRADUATION_YEAR}卒`;
export const GRADUATION_FULL_YEAR = `20${GRADUATION_YEAR}`;
