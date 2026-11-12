export async function apiFetch(url, options = {}) {
  const { body, headers, ...rest } = options;
  const hasBody = body !== undefined;
  const response = await fetch(url, {
    ...rest,
    headers: hasBody
      ? { 'Content-Type': 'application/json', ...headers }
      : headers,
    body: hasBody ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || 'リクエストに失敗しました');
  }

  return data;
}
