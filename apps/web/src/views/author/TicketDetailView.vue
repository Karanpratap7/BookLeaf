<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../../api'

const route = useRoute()
const ticket = ref(null)
const error = ref('')
const reply = ref('')
const sending = ref(false)
let timer

const canReply = computed(() => {
  if (!ticket.value) return false
  return ticket.value.status !== 'Closed'
})

async function load() {
  try {
    ticket.value = await api.ticket(route.params.id)
    error.value = ''
  } catch (e) {
    error.value = e.message
  }
}

async function sendReply() {
  if (!reply.value.trim() || sending.value) return
  sending.value = true
  error.value = ''
  try {
    await api.replyToTicket(route.params.id, reply.value.trim())
    reply.value = ''
    await load()
  } catch (e) {
    error.value = e.message
  } finally {
    sending.value = false
  }
}

onMounted(() => {
  load()
  timer = setInterval(load, 4000)
})
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <div style="max-width: 760px">
    <RouterLink to="/author/tickets" class="muted">← Back to tickets</RouterLink>
    <div v-if="error" class="error" style="margin-top: 1rem">{{ error }}</div>
    <div v-else-if="!ticket" class="empty">Loading…</div>
    <template v-else>
      <div style="display: flex; justify-content: space-between; gap: 1rem; align-items: start; margin-top: 0.75rem">
        <div>
          <h2 style="margin: 0">{{ ticket.subject }}</h2>
          <p class="muted">
            {{ ticket.book?.title || 'General / Account Level' }}
            · {{ new Date(ticket.createdAt).toLocaleString() }}
          </p>
        </div>
        <span class="badge" :class="ticket.status" data-status="ticket.status">{{ ticket.status }}</span>
      </div>
      <div class="card" style="margin-top: 1rem">
        <h3 style="margin-top: 0">Conversation</h3>
        <div
          v-for="m in ticket.messages"
          :key="m.id"
          style="padding: 0.85rem 0; border-bottom: 1px solid var(--line)"
        >
          <div style="display: flex; justify-content: space-between; gap: 1rem">
            <strong>{{ m.senderRole === 'ADMIN' ? 'BookLeaf Support' : 'You' }}</strong>
            <span class="muted" style="font-size: 0.8rem">{{ new Date(m.createdAt).toLocaleString() }}</span>
          </div>
          <p style="margin: 0.4rem 0 0; white-space: pre-wrap">{{ m.body }}</p>
        </div>
        <p v-if="!ticket.messages?.length" class="muted">No messages yet.</p>
      </div>

      <div v-if="canReply" class="card" style="margin-top: 1rem">
        <h3 style="margin-top: 0">Continue conversation</h3>
        <p class="muted" style="font-size: 0.9rem">
          Add a follow-up for the BookLeaf team on this ticket.
        </p>
        <div class="field">
          <textarea
            v-model="reply"
            rows="4"
            placeholder="Type your follow-up message…"
          />
        </div>
        <button type="button" :disabled="sending || !reply.trim()" @click="sendReply">
          {{ sending ? 'Sending…' : 'Send message' }}
        </button>
      </div>
      <p v-else class="muted" style="margin-top: 1rem">
        This ticket is closed. Open a new query if you need more help.
      </p>
    </template>
  </div>
</template>
