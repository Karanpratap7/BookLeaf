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

// Timeline computed properties
const timeline = computed(() => {
  if (!ticket.value) return []

  const events = []

  // Ticket creation event
  events.push({
    id: 'creation',
    title: 'Ticket created',
    time: new Date(ticket.value.createdAt),
    description: 'Your ticket was submitted',
    type: 'creation',
    status: 'default',
  })

  // Add admin messages to timeline
  const adminMessages = ticket.value.messages.filter((m) => m.senderRole === 'ADMIN')
  if (adminMessages.length > 0) {
    adminMessages.forEach((msg, index) => {
      events.push({
        id: `admin-${index}`,
        title: 'Admin response',
        time: new Date(msg.createdAt),
        description: `BookLeaf Support: ${msg.body.slice(0, 80)}${msg.body.length > 80 ? '...' : ''}`,
        type: 'admin',
        status: 'default',
      })
    })
  }

  // Add author messages to timeline
  const authorMessages = ticket.value.messages.filter((m) => m.senderRole === 'AUTHOR')
  if (authorMessages.length > 0) {
    authorMessages.forEach((msg, index) => {
      events.push({
        id: `author-${index}`,
        title: 'Your message',
        time: new Date(msg.createdAt),
        description: `You: ${msg.body.slice(0, 80)}${msg.body.length > 80 ? '...' : ''}`,
        type: 'author',
        status: 'default',
      })
    })
  }

  // Sort by time
  events.sort((a, b) => a.time.getTime() - b.time.getTime())

  return events
})

onMounted(() => {
  load()
  timer = setInterval(() => !document.hidden && load(), 4000)
})
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <div style="max-width: 760px">
    <RouterLink to="/author/tickets" class="muted">← Back to tickets</RouterLink>
    <p v-if="error" class="error" style="margin-top: 1rem">{{ error }}</p>
    <p v-else-if="!ticket" class="empty">Loading…</p>
    <div v-else class="ticket-detail">
      <div
        style="
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: start;
          margin-top: 0.75rem;
        "
      >
        <div>
          <h2 style="margin: 0">{{ ticket.subject }}</h2>
          <p class="muted">
            {{ ticket.book?.title || 'General / Account Level' }}
            · {{ new Date(ticket.createdAt).toLocaleString() }}
          </p>
        </div>
        <span class="badge" :class="ticket.status" :data-status="ticket.status">{{
          ticket.status
        }}</span>
      </div>

      <!-- Timeline Section -->
      <div
        v-if="ticket.messages.length > 0"
        class="card"
        style="margin-top: 1rem; margin-bottom: 1rem"
      >
        <div
          style="
            padding: 0.75rem 1rem;
            background: var(--background);
            border-radius: 8px;
            margin-bottom: 0.75rem;
          "
        >
          <strong style="font-size: 0.85rem">Ticket Journey</strong>
          <span style="float: right; font-size: 0.75rem; color: var(--muted)">
            {{ timeline.length }} milestone{{ timeline.length !== 1 ? 's' : '' }}
          </span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.5rem; min-height: 120px">
          <template v-for="event in timeline" :key="event.id">
            <div
              style="
                display: flex;
                align-items: flex-start;
                padding: 0.5rem 0.75rem;
                border-left: 3px solid var(--primary);
                background: var(--surface);
                border-radius: 4px 0 0 4px;
                min-width: 200px;
              "
            >
              <span
                style="
                  width: 8px;
                  height: 8px;
                  background: var(--primary);
                  border-radius: 50%;
                  margin-right: 0.5rem;
                  flex-shrink: 0;
                  margin-top: 0.1rem;
                "
              ></span>
              <div style="flex: 1">
                <strong style="font-size: 0.8rem; color: var(--text-primary)">{{
                  event.title
                }}</strong>
                <span class="muted" style="font-size: 0.7rem; color: var(--muted)">
                  {{ new Date(event.time).toLocaleString() }}
                </span>
                <p
                  v-if="event.description"
                  style="font-size: 0.75rem; margin: 0.2rem 0 0; color: var(--muted)"
                >
                  {{ event.description }}
                </p>
              </div>
            </div>
          </template>
        </div>
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
            <span class="muted" style="font-size: 0.8rem">
              {{ new Date(m.createdAt).toLocaleString() }}
            </span>
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
          <textarea v-model="reply" rows="4" placeholder="Type your follow-up message…" />
        </div>
        <button type="button" :disabled="sending || !reply.trim()" @click="sendReply">
          {{ sending ? 'Sending…' : 'Send message' }}
        </button>
      </div>
      <p v-else class="muted" style="margin-top: 1rem">
        This ticket is closed. Open a new query if you need more help.
      </p>
    </div>
  </div>
</template>
