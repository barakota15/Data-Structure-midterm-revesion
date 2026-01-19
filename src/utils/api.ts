export interface ApiError {
  error: {
    message: string;
    code: string;
    details?: Array<{ message: string; field?: string }>;
  };
}

let csrfToken: string | null = null;

export const fetchCsrfToken = async () => {
  const response = await fetch('/api/auth/csrf', { credentials: 'include' });
  if (!response.ok) {
    throw new Error('Unable to fetch CSRF token');
  }
  const data = (await response.json()) as { csrfToken: string };
  csrfToken = data.csrfToken;
  return csrfToken;
};

export const apiFetch = async <T>(url: string, options: RequestInit = {}) => {
  if (!csrfToken && options.method && options.method !== 'GET') {
    await fetchCsrfToken();
  }

  const headers = new Headers(options.headers ?? {});
  if (options.method && options.method !== 'GET') {
    headers.set('x-csrf-token', csrfToken ?? '');
  }
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include'
  });

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throw new Error(error.error?.message ?? 'Request failed');
  }

  return (await response.json()) as T;
};
