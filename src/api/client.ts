export async function apiFetch(
  path: string,
  getIdToken: () => Promise<string>,
  options?: RequestInit,
): Promise<Response> {
  const baseUrl = process.env.NEXT_PUBLIC_WORKER_URL
  const token = await getIdToken()
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  })
}

export async function apiJSON<T>(
  path: string,
  getIdToken: () => Promise<string>,
  options?: RequestInit,
): Promise<T> {
  const res = await apiFetch(path, getIdToken, options)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as any).error || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}
