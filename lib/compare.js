// The companies holding the best value of a metric in the compare view.
// `metric(company)` returns a number or null. Nothing is best when fewer than
// two companies have a value, or when every company with a value ties: a
// "best" that everyone shares says nothing.
export function getBestCompanyIds(companies, metric, direction = 'max') {
  const values = companies
    .map(company => ({ id: String(company.id), value: metric(company) }))
    .filter(item => typeof item.value === 'number' && Number.isFinite(item.value));
  if (values.length <= 1) return new Set();

  const numbers = values.map(item => item.value);
  const bestValue = direction === 'min' ? Math.min(...numbers) : Math.max(...numbers);
  const worstValue = direction === 'min' ? Math.max(...numbers) : Math.min(...numbers);
  if (bestValue === worstValue) return new Set();
  return new Set(values.filter(item => item.value === bestValue).map(item => item.id));
}
