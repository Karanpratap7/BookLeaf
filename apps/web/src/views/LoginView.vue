<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()
const email = ref('priya.sharma@email.com')
const password = ref('Author@123')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    const data = await auth.login(email.value.trim(), password.value)
    router.push(data.role === 'ADMIN' ? '/admin/tickets' : '/author/books')
  } catch (e) {
    error.value = e.message || 'Login failed'
  } finally {
    loading.value = false
  }
}

function fill(role) {
  if (role === 'admin') {
    email.value = 'admin@bookleaf.com'
    password.value = 'Admin@123'
  } else {
    email.value = 'priya.sharma@email.com'
    password.value = 'Author@123'
  }
}
</script>

<template>
  <div style="max-width: 420px; margin: 4rem auto">
    <div class="card">
      <h1 class="brand" style="margin-top: 0">BookLeaf</h1>
      <p class="muted">Author Support & Communication Portal</p>
      <div v-if="error" class="error">{{ error }}</div>
      <form @submit.prevent="submit">
        <div class="field">
          <label>Email</label>
          <input v-model="email" type="email" required autocomplete="username" />
        </div>
        <div class="field">
          <label>Password</label>
          <input v-model="password" type="password" required autocomplete="current-password" />
        </div>
        <button type="submit" style="width: 100%" :disabled="loading">
          {{ loading ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>
      <div style="margin-top: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap">
        <button class="secondary" type="button" @click="fill('author')">Try author</button>
        <button class="secondary" type="button" @click="fill('admin')">Try admin</button>
      </div>
      <p class="muted" style="font-size: 0.8rem; margin-top: 1rem">
        Authors: Author@123 · Admins: Admin@123
      </p>
    </div>
  </div>
</template>
