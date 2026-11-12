// Shared by client views, API validation, and legacy import handling.
export const STATUSES = Object.freeze([
  '未応募', '興味あり', 'ES準備中', 'ES提出済', '面接中', '合格', '辞退', '不合格',
]);

export const STATUS_ALIASES = Object.freeze({ '内定': '合格' });

export function normalizeStatus(status) {
  return Object.hasOwn(STATUS_ALIASES, status) ? STATUS_ALIASES[status] : (status || '未応募');
}
