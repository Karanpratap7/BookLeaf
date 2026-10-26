import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from './stores/auth'
import LoginView from './views/LoginView.vue'
import AuthorBooks from './views/author/BooksView.vue'
import AuthorTickets from './views/author/TicketsView.vue'
import AuthorNewTicket from './views/author/NewTicketView.vue'
import AuthorTicketDetail from './views/author/TicketDetailView.vue'
import AdminQueue from './views/admin/QueueView.vue'
import AdminTicketDetail from './views/admin/TicketDetailView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', component: LoginView, meta: { guest: true } },
    { path: '/author/books', component: AuthorBooks, meta: { role: 'AUTHOR' } },
    { path: '/author/tickets', component: AuthorTickets, meta: { role: 'AUTHOR' } },
    { path: '/author/tickets/new', component: AuthorNewTicket, meta: { role: 'AUTHOR' } },
    { path: '/author/tickets/:id', component: AuthorTicketDetail, meta: { role: 'AUTHOR' } },
    { path: '/admin/tickets', component: AdminQueue, meta: { role: 'ADMIN' } },
    { path: '/admin/tickets/:id', component: AdminTicketDetail, meta: { role: 'ADMIN' } },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.guest) {
    if (auth.isLoggedIn) {
      return auth.isAdmin ? '/admin/tickets' : '/author/books'
    }
    return true
  }
  if (!auth.isLoggedIn) return '/login'
  if (to.meta.role && auth.role !== to.meta.role) {
    return auth.isAdmin ? '/admin/tickets' : '/author/books'
  }
  return true
})

export default router
