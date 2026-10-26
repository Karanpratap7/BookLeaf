<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../../api'

const route = useRoute()
const ticket = ref(null)
const error = ref('')
const draft = ref('')
const draftMsg = ref('')
const reply = ref('')
const note = ref('')
const status = ref('')
const categoryOverride = ref('')
const priorityOverride = ref('')
const busy = ref(false)

const categories = [
  'Royalty & Payments',
  'ISBN & Metadata Issues',
  'Printing & Quality',
  'Distribution & Availability',
  'Book Status & Production Updates',
  'General Inquiry',
]

const displayCategory = computed(
  () => ticket.value?.categoryOverride || ticket.value?.category
)
const displayPriority = computed(
  () => ticket.value?.priorityOverride || ticket.value?.priority
)

async function load() {
  ticket.value = await api.adminTicket(route.params.id)
  status.value = ticket.value.status
  categoryOverride.value = ticket.value.categoryOverride || ticket.value.category
  priorityOverride.value = ticket.value.priorityOverride || ticket.value.priority
}

onMounted(async () => {
  try {
    await load()
    await generateDraft()
  } catch (e) {
    error.value = e.message
  }
})

async function generateDraft() {
  draftMsg.value = 'Generating AI draft…'
  try {
    const data = await api.aiDraft(route.params.id)
    draft.value = data.draft || ''
    reply.value = data.draft || ''
    draftMsg.value = data.error || (data.draft ? 'AI draft ready — edit before sending.' : 'Draft unavailable — write manually.')
  } catch (e) {
    draft.value = ''
    draftMsg.value = 'Draft unavailable — write manually.'
  }
}

async function saveMeta() {
  busy.value = true
  try {
    await api.patchTicket(route.params.id, {
      status: status.value,
      categoryOverride: categoryOverride.value,
      priorityOverride: priorityOverride.value,
    })
    await load()
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}

async function assignSelf() {
  busy.value = true
  try {
    await api.patchTicket(route.params.id, { assignSelf: true })
    await load()
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}

async function sendReply() {
  if (!reply.value.trim()) return
  busy.value = true
  try {
    await api.sendResponse(route.params.id, reply.value.trim())
    reply.value = ''
    await load()
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}

async function addNote() {
  if (!note.value.trim()) return
  busy.value = true
  try {
    await api.addNote(route.params.id, note.value.trim())
    note.value = ''
    await load()
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <RouterLink to="/admin/tickets" class="muted">← Back to queue</RouterLink>
    <div v-if="error" class="error" style="margin-top: 1rem">{{ error }}</div>
    <div v-else-if="!ticket" class="empty">Loading ticket…</div>
    <template v-else>
      <div style="display: flex; justify-content: space-between; gap: 1rem; margin-top: 0.75rem; flex-wrap: wrap">
        <div>
          <h2 style="margin: 0">{{ ticket.subject }}</h2>
          <p class="muted">
            {{ ticket.author?.name }} ({{ ticket.author?.email }})
            · {{ ticket.book?.title || 'General / Account Level' }}
          </p>
        </div>
        <div style="display: flex; gap: 0.5rem; align-items: center">
          <span class="badge" :class="displayPriority">{{ displayPriority }}</span>
          <span class="badge" :class="ticket.status">{{ ticket.status }}</span>
        </div>
      </div>

      <div class="grid-2" style="margin-top: 1rem">
        <div class="card">
          <h3 style="margin-top: 0">Author query</h3>
          <p style="white-space: pre-wrap">{{ ticket.description }}</p>
          <p class="muted" style="font-size: 0.85rem">
            AI category: {{ ticket.category }} · AI priority: {{ ticket.priority }}
          </p>

          <h3>Conversation</h3>
          <div
            v-for="m in ticket.messages"
            :key="m.id"
            style="padding: 0.7rem 0; border-bottom: 1px solid var(--line)"
          >
            <strong>{{ m.senderRole }}</strong>
            <span class="muted" style="font-size: 0.8rem; margin-left: 0.5rem">
              {{ new Date(m.createdAt).toLocaleString() }}
            </span>
            <p style="margin: 0.35rem 0 0; white-space: pre-wrap">{{ m.body }}</p>
          </div>
        </div>

        <div class="card">
          <h3 style="margin-top: 0">Manage</h3>
          <div class="field">
            <label>Status</label>
            <select v-model="status">
              <option>Open</option>
              <option>In Progress</option>
              <option>Resolved</option>
              <option>Closed</option>
            </select>
          </div>
          <div class="field">
            <label>Category (override AI)</label>
            <select v-model="categoryOverride">
              <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
          <div class="field">
            <label>Priority (override AI)</label>
            <select v-model="priorityOverride">
              <option>Critical</option>
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
          </div>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap">
            <button type="button" :disabled="busy" @click="saveMeta">Save</button>
            <button class="secondary" type="button" :disabled="busy" @click="assignSelf">
              Assign to me
            </button>
          </div>
          <p class="muted" style="font-size: 0.85rem">
            Assigned: {{ ticket.assignedAdmin?.name || 'Unassigned' }}
          </p>

          <h3>Internal notes</h3>
          <div
            v-for="n in ticket.internalNotes"
            :key="n.id"
            style="padding: 0.5rem 0; border-bottom: 1px solid var(--line); font-size: 0.9rem"
          >
            <strong>{{ n.admin?.name }}</strong>
            <span class="muted"> · {{ new Date(n.createdAt).toLocaleString() }}</span>
            <div>{{ n.body }}</div>
          </div>
          <div class="field" style="margin-top: 0.75rem">
            <textarea v-model="note" placeholder="Note visible only to admins" />
          </div>
          <button class="secondary" type="button" :disabled="busy" @click="addNote">Add note</button>
        </div>
      </div>

      <div class="card" style="margin-top: 1rem">
        <div style="display: flex; justify-content: space-between; gap: 1rem; align-items: center">
          <h3 style="margin: 0">AI draft response</h3>
          <button class="secondary" type="button" @click="generateDraft">Regenerate</button>
        </div>
        <p class="muted" style="font-size: 0.9rem">{{ draftMsg }}</p>
        <div class="field">
          <textarea v-model="reply" rows="8" placeholder="Edit the draft, then send to the author" />
        </div>
        <button type="button" :disabled="busy || !reply.trim()" @click="sendReply">
          Send response to author
        </button>
      </div>
    </template>
  </div>
</template>
