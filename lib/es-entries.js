// An ES entry's companies, in the order the user linked them.
export function getEntryCompanyIds(entry) {
  return Array.isArray(entry?.company_ids) ? entry.company_ids.filter(Boolean) : [];
}
