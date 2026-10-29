const API = ''  // Vercel base URL (for non-Prisma routes)
const NEON_FUNCTION_URL = 'https://br-jolly-surf-aoythdu2-ticketsapi.compute.c-2.ap-southeast-1.aws.neon.tech'  // Neon Functions base URL

function headers() {
  const h = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem('token')
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

// Generic fetch function that supports both Vercel and Neon URLs
async function request(path, options = {}) {
  // Determine which base URL to use based on the path
  // Prisma-dependent routes go to Neon Functions, non-Prisma routes go to Vercel
  const neonPaths = [
    '/api/auth/login',         // Auth - on Vercel for CORS
    '/api/authors/me/books',   // Authors me books
    '/api/tickets/mine',       // Tickets mine - Prisma-dependent
    '/api/admin/tickets',       // Admin tickets - Prisma-dependent
    '/api/admin/tickets/[id]', // Admin ticket detail - Prisma-dependent
    '/api/admin/tickets/[id]/ai-draft', // AI draft - Prisma-dependent
    '/api/admin/tickets/[id]/notes', // Notes - Prisma-dependent
    '/api/admin/tickets/[id]/responses', // Responses - Prisma-dependent
    '/api/admin/stats',         // Stats - Prisma-dependent
    '/api/tickets/[id]',       // Ticket detail - Prisma-dependent
    '/api/tickets/mine',       // Tickets mine - Prisma-dependent
    '/api/tickets/[id]/messages', // Ticket messages - Prisma-dependent
  ]
  
  // Use Neon Functions for Prisma-dependent routes, Vercel for non-Prisma routes
  const useNeon = neonPaths.includes(path)
  const baseURL = useNeon ? NEON_FUNCTION_URL : API
  
  const res = await fetch(`${baseURL}${path}`, {
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
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`)
    err.status = res.status
    err.details = data?.details
    throw err
  }
  return data
}

// API endpoints - mix of Vercel and Neon routes
export const api = {
  // Vercel routes (non-Prisma, have working CORS - login, books, health)
  login: (email, password) =>
    request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request('/api/auth/me'),
  myBooks: () => request('/api/books'),
  
  // Neon Functions routes (Prisma-dependent, no cold starts)
  myTickets: () => request('/api/tickets/mine'),
  ticket: (id) => request(`/api/tickets/${id}`),
  createTicket: (payload) =>
    request('/api/tickets', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  adminTickets: (params = {}) => {
    const q = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v))
    ).toString()
    return request(`/api/admin/tickets${q ? `?${q}` : ''})
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
  aiDraft: (id) =>
    request(`/api/admin/tickets/${id}/ai-draft`, { method: 'POST' }),
  replyToTicket: (id, body) =>
    request(`/api/tickets/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),
}
