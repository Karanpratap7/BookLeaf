<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { api } from '../../api'

const tickets = ref([])
const error = ref('')
const loading = ref(true)
let timer

async function load() {
  try {
    tickets.value = await api.myTickets()
    error.value = ''
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load()
  timer = setInterval(() => !document.hidden && load(), 5000)
})
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem">
      <div>
        <h2 style="margin: 0">My Tickets</h2>
        <p class="muted">Updates refresh automatically every few seconds.</p>
      </div>
      <RouterLink to="/author/tickets/new"><button type="button">New query</button></RouterLink>
    </div>
    <div v-if="error" class="error">{{ error }}</div>
    <div v-else-if="loading" class="empty">Loading tickets…</div>
    <div v-else-if="!tickets.length" class="empty">
      No tickets yet. Raise a support query to get started.
    </div>
    <div v-else class="card" style="padding: 0">
      <div
        v-for="t in tickets"
        :key="t.id"
        style="padding: 1rem 1.25rem; border-bottom: 1px solid var(--line)"
      >
        <div style="display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap">
          <div>
            <RouterLink :to="`/author/tickets/${t.id}`"
              ><strong>{{ t.subject }}</strong></RouterLink
            >
            <div class="muted" style="font-size: 0.85rem">
              {{ new Date(t.createdAt).toLocaleString() }}
              · {{ t.category }} · {{ t.priority }}
            </div>
          </div>
          <span class="badge" :class="t.status" :data-status="t.status">{{ t.status }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
