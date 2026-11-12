<script setup>
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import { api } from '../../api'

const tickets = ref([])
const error = ref('')
const loading = ref(true)
const filters = reactive({
  status: '',
  category: '',
  priority: '',
})
const quality = ref(null)

const pct = (n) => `${Math.round((n ?? 0) * 100)}%`

const categories = [
  'Royalty & Payments',
  'ISBN & Metadata Issues',
  'Printing & Quality',
  'Distribution & Availability',
  'Book Status & Production Updates',
  'General Inquiry',
]

async function load() {
  try {
    tickets.value = await api.adminTickets({ ...filters })
    error.value = ''
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function displayCategory(t) {
  return t.categoryOverride || t.category
}
function displayPriority(t) {
  return t.priorityOverride || t.priority
}

const DAY = 86_400_000
const unresolved = (t) => t.status === 'Open' || t.status === 'In Progress'
const isUrgent = (t) => unresolved(t) && ['Critical', 'High'].includes(displayPriority(t))
const isAging = (t) => unresolved(t) && Date.now() - new Date(t.createdAt) > 2 * DAY

function age(t) {
  const h = Math.floor((Date.now() - new Date(t.createdAt)) / 3_600_000)
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`
}

// Draft quality changes only when a reply is sent, so it is fetched once per visit rather than
// riding the 10s queue poll.
async function loadQuality() {
  try {
    quality.value = await api.aiQuality()
  } catch (e) {
    quality.value = null
  }
}

let timer
onMounted(() => {
  load()
  loadQuality()
  timer = setInterval(() => !document.hidden && load(), 10000)
})
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <div>
    <h2 style="margin-top: 0">Ticket Queue</h2>
    <p class="muted">Urgent and oldest unresolved tickets sort to the top.</p>

    <div class="card" style="margin-bottom: 1rem">
      <div class="grid-2" style="grid-template-columns: repeat(4, 1fr); align-items: end">
        <div class="field" style="margin: 0">
          <label>Status</label>
          <select v-model="filters.status">
            <option value="">All</option>
            <option>Open</option>
            <option>In Progress</option>
            <option>Resolved</option>
            <option>Closed</option>
          </select>
        </div>
        <div class="field" style="margin: 0">
          <label>Category</label>
          <select v-model="filters.category">
            <option value="">All</option>
            <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
        <div class="field" style="margin: 0">
          <label>Priority</label>
          <select v-model="filters.priority">
            <option value="">All</option>
            <option>Critical</option>
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
        </div>
        <button type="button" @click="load">Apply filters</button>
      </div>
    </div>

    <div v-if="quality" class="card" style="margin-bottom: 1rem">
      <div style="display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap">
        <div>
          <h3 style="margin: 0">AI draft quality</h3>
          <p class="muted" style="font-size: 0.85rem; margin: 0.25rem 0 0">
            How admins treated drafts before sending, across all tickets.
          </p>
        </div>
        <div style="text-align: right">
          <div style="font-size: 1.6rem; font-weight: 700; line-height: 1">
            {{ pct(quality.acceptRate) }}
          </div>
          <div class="muted" style="font-size: 0.75rem">sent as drafted</div>
        </div>
      </div>

      <div
        v-if="quality.evaluated"
        style="
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 0.75rem;
          margin-top: 0.85rem;
        "
      >
        <div>
          <div class="muted" style="font-size: 0.75rem">Evaluated</div>
          <strong>{{ quality.evaluated }}</strong>
        </div>
        <div>
          <div class="muted" style="font-size: 0.75rem">Accepted verbatim</div>
          <strong>{{ quality.accepted }}</strong>
        </div>
        <div>
          <div class="muted" style="font-size: 0.75rem">Edited</div>
          <strong>{{ quality.edited }}</strong>
        </div>
        <div>
          <div class="muted" style="font-size: 0.75rem">Discarded</div>
          <strong>{{ quality.discarded }}</strong>
        </div>
        <div>
          <div class="muted" style="font-size: 0.75rem">Avg similarity</div>
          <strong>{{ pct(quality.avgSimilarity) }}</strong>
        </div>
        <div>
          <div class="muted" style="font-size: 0.75rem">Template fallback</div>
          <strong>{{ pct(quality.fallbackRate) }}</strong>
          <div class="muted" style="font-size: 0.75rem">
            {{ quality.fallbacks }}/{{ quality.generated }} drafts
          </div>
        </div>
      </div>
      <p v-else class="muted" style="font-size: 0.9rem; margin-bottom: 0">
        No drafts sent yet. Open a ticket, generate a draft and send a reply to start measuring.
      </p>

      <table v-if="quality.byCategory?.length" class="table" style="margin-top: 0.75rem">
        <thead>
          <tr>
            <th>Category</th>
            <th>Drafts</th>
            <th>Accepted</th>
            <th>Edited</th>
            <th>Discarded</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in quality.byCategory" :key="c.category">
            <td>{{ c.category }}</td>
            <td>{{ c.generated }}</td>
            <td>{{ c.accepted }}</td>
            <td>{{ c.edited }}</td>
            <td>{{ c.discarded }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-else-if="loading" class="empty">Loading queue…</div>
    <div v-else-if="!tickets.length" class="empty">No tickets match these filters.</div>
    <div v-else class="card table-wrap" style="padding: 0.5rem 1rem">
      <table class="table">
        <thead>
          <tr>
            <th>Priority</th>
            <th>Status</th>
            <th>Subject</th>
            <th>Author</th>
            <th>Category</th>
            <th>Assignee</th>
            <th>Age</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in tickets" :key="t.id" :class="{ urgent: isUrgent(t), aging: isAging(t) }">
            <td>
              <span class="badge" :class="displayPriority(t)">{{ displayPriority(t) }}</span>
            </td>
            <td>
              <span class="badge" :class="t.status" :data-status="t.status">{{ t.status }}</span>
            </td>
            <td>
              <RouterLink :to="`/admin/tickets/${t.id}`"
                ><strong>{{ t.subject }}</strong></RouterLink
              >
            </td>
            <td>{{ t.author?.name }}</td>
            <td>{{ displayCategory(t) }}</td>
            <td>{{ t.assignedAdmin?.name || '—' }}</td>
            <td :title="new Date(t.createdAt).toLocaleString()">{{ age(t) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
