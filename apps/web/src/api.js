function headers() {
  const h = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem('token')
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

async function request(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) },
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { error: text || 'Invalid response' }
  }
  // Expired/invalid session: drop it and send the user back to login.
  if (res.status === 401 && path !== '/api/auth/login') {
    localStorage.clear()
    window.location.assign('/login')
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`)
    err.status = res.status
    err.details = data?.details
    throw err
  }
  return data
}

export const api = {
  login: (email, password) =>
    request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request('/api/auth/me'),
  myBooks: () => request('/api/authors/me/books'),

  myTickets: () => request('/api/tickets/mine'),
  ticket: (id) => request(`/api/tickets/${id}`),
  createTicket: (payload) =>
    request('/api/tickets', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  adminTickets: (params = {}) => {
    const q = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v)),
    ).toString()
    return request(`/api/admin/tickets${q ? `?${q}` : ''}`)
  },
  adminTicket: (id) => request(`/api/admin/tickets/${id}`),
  patchTicket: (id, payload) =>
    request(`/api/admin/tickets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  addNote: (id, body) =>
    request(`/api/admin/tickets/${id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),
  sendResponse: (id, body) =>
    request(`/api/admin/tickets/${id}/responses`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),
  aiDraft: (id, regenerate = false) =>
    request(`/api/admin/tickets/${id}/ai-draft${regenerate ? '?regenerate=1' : ''}`, {
      method: 'POST',
    }),
  replyToTicket: (id, body) =>
    request(`/api/tickets/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),
}
