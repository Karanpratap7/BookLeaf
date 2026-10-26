<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from './stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const showNav = computed(() => route.path !== '/login')

function logout() {
  auth.logout()
  router.push('/login')
}
</script>

<template>
  <div class="layout">
    <header v-if="showNav" class="topbar">
      <div>
        <div class="brand">BookLeaf</div>
        <div class="muted" style="font-size: 0.85rem">
          {{ auth.user?.name }} · {{ auth.role }}
        </div>
      </div>
      <nav class="nav">
        <template v-if="auth.isAuthor">
          <RouterLink to="/author/books">My Books</RouterLink>
          <RouterLink to="/author/tickets">My Tickets</RouterLink>
          <RouterLink to="/author/tickets/new">New Query</RouterLink>
        </template>
        <template v-else-if="auth.isAdmin">
          <RouterLink to="/admin/tickets">Ticket Queue</RouterLink>
        </template>
        <button class="ghost" type="button" @click="logout">Log out</button>
      </nav>
    </header>
    <RouterView />
  </div>
</template>
