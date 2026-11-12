<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { api } from '../../api'

const tickets = ref([])
const error = ref('')
const loading = ref(true)
const royalty = ref(null)
const salesInsights = ref(null)
let timer

async function loadTickets() {
  try {
    tickets.value = await api.myTickets()
    error.value = ''
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

// Insights are supplementary: if either endpoint fails, the ticket list must still render.
async function loadInsights() {
  try {
    royalty.value = await api.royaltyAnalytics()
  } catch (e) {
    royalty.value = null
  }
  try {
    salesInsights.value = await api.salesInsights()
  } catch (e) {
    salesInsights.value = null
  }
}

const inr = (n) => (n == null ? '—' : `₹${Number(n).toLocaleString('en-IN')}`)
const num = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN'))

onMounted(async () => {
  await loadTickets()
  await loadInsights()
  timer = setInterval(() => !document.hidden && loadTickets(), 5000)
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
    <template v-else>
      <div v-if="royalty" class="card" style="margin-top: 1rem; padding: 1rem">
        <h3 style="margin-top: 0">Royalty Snapshot</h3>
        <div
          style="
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 0.75rem;
          "
        >
          <div>
            <div class="muted" style="font-size: 0.75rem">Pending</div>
            <strong>{{ inr(royalty.totalRoyaltyPending) }}</strong>
          </div>
          <div>
            <div class="muted" style="font-size: 0.75rem">Earned</div>
            <strong>{{ inr(royalty.totalRoyaltyEarned) }}</strong>
          </div>
          <div>
            <div class="muted" style="font-size: 0.75rem">Copies sold</div>
            <strong>{{ num(royalty.totalCopiesSold) }}</strong>
          </div>
          <div>
            <div class="muted" style="font-size: 0.75rem">Next payout date</div>
            <strong>{{ royalty.nextPayoutDate || '—' }}</strong>
          </div>
        </div>
        <p v-if="royalty.overdueBooks > 0" class="error" style="margin-bottom: 0">
          {{ royalty.overdueBooks }} title{{ royalty.overdueBooks === 1 ? ' is' : 's are' }} past
          the payout window. Our payments team is on it.
        </p>
      </div>

      <div v-if="salesInsights" class="card" style="margin-top: 1rem; padding: 1rem">
        <h3 style="margin-top: 0">AI Sales Insights</h3>
        <p class="muted" style="font-size: 0.85rem; margin-bottom: 0.5rem">
          Based on your top titles by copies sold
        </p>
        <div
          style="
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 0.75rem;
          "
        >
          <div>
            <div class="muted" style="font-size: 0.75rem">Best selling title</div>
            <strong>{{ salesInsights.bestSellingTitle?.title || '—' }}</strong>
            <div class="muted" style="font-size: 0.8rem">
              {{ num(salesInsights.bestSellingTitle?.copies) }} copies
            </div>
          </div>
          <div>
            <div class="muted" style="font-size: 0.75rem">Best selling genre</div>
            <strong>{{ salesInsights.bestSellingGenre?.genre || '—' }}</strong>
            <div class="muted" style="font-size: 0.8rem">
              {{ num(salesInsights.bestSellingGenre?.totalCopies) }} copies
            </div>
          </div>
          <div>
            <div class="muted" style="font-size: 0.75rem">Average royalty per copy</div>
            <strong>{{ inr(salesInsights.avgRoyaltyPerCopy) }}</strong>
          </div>
        </div>
      </div>

      <h3 style="margin: 1.25rem 0 0.5rem">Tickets</h3>
      <div v-if="!tickets.length" class="empty">
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
                · {{ t.category || '—' }} · {{ t.priority || '—' }}
              </div>
            </div>
            <span class="badge" :class="t.status" :data-status="t.status">{{ t.status }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
