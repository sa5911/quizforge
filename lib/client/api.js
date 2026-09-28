export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function api(path, { method = 'GET', body, form } = {}) {
  const init = { method, credentials: 'same-origin', headers: {} };
  if (form) init.body = form;
  else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection.', 0);
  }
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('session-expired'));
    const detail = data?.details?.length ? `: ${data.details.map((d) => `${d.path} ${d.message}`).join('; ')}` : '';
    throw new ApiError((data?.error || `Request failed (${res.status})`) + detail, res.status, data?.details);
  }
  return data;
}

api.get = (p) => api(p);
api.post = (p, body = {}) => api(p, { method: 'POST', body });
api.put = (p, body) => api(p, { method: 'PUT', body });
api.patch = (p, body) => api(p, { method: 'PATCH', body });
api.del = (p) => api(p, { method: 'DELETE' });
