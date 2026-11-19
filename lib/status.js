// Shared by client views, API validation, and legacy import handling.
export const STATUSES = Object.freeze([
  '未応募', '興味あり', 'ES準備中', 'ES提出済', '面接中', '合格', '辞退', '不合格',
]);

export const STATUS_ALIASES = Object.freeze({ '内定': '合格' });

export function normalizeStatus(status) {
  return Object.hasOwn(STATUS_ALIASES, status) ? STATUS_ALIASES[status] : (status || '未応募');
}

// How far a selection has come along its route, for the progress rail:
// 興味あり → ES準備中 → ES提出済 → 面接中 → 合格, one stop each. 未応募 has
// not set out yet (step 0). 合格 arrives ('done'); 辞退 and 不合格 have left
// the route ('ended'), and no record says where, so they carry no step.
export const PROGRESS_STOPS = 5;
const PROGRESS_STEPS = Object.freeze({
  '未応募': 0, '興味あり': 1, 'ES準備中': 2, 'ES提出済': 3, '面接中': 4, '合格': 5,
});

export function getStatusProgress(status) {
  const normalized = normalizeStatus(status);
  if (normalized === '合格') return { step: PROGRESS_STOPS, state: 'done' };
  if (normalized === '辞退' || normalized === '不合格') return { step: 0, state: 'ended' };
  return { step: Object.hasOwn(PROGRESS_STEPS, normalized) ? PROGRESS_STEPS[normalized] : 0, state: 'open' };
}
