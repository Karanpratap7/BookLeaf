<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { api } from '../../api'

const royalty = ref(null)
const salesInsights = ref(null)
const error = ref('')
const loading = ref(true)
let timer

async function load() {
  try {
    const [royaltyData, insightData] = await Promise.all([
      api.royaltyAnalytics(),
      api.salesInsights(),
    ])
    royalty.value = royaltyData
    salesInsights.value = insightData
    error.value = ''
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

const inr = (n) => (n == null ? '—' : `₹${Number(n).toLocaleString('en-IN')}`)
const num = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN'))

// ---------- Pie chart (royalties earned vs remaining) ----------
const SIZE = 220
const CX = SIZE / 2
const CY = SIZE / 2
const R = 96

function point(angle) {
  const rad = ((angle - 90) * Math.PI) / 180
  return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) }
}

// Pie slice from startAngle to endAngle, drawn clockwise from 12 o'clock.
function sector(startAngle, endAngle) {
  const start = point(startAngle)
  const end = point(endAngle)
  const large = endAngle - startAngle > 180 ? 1 : 0
  return [
    `M ${CX} ${CY}`,
    `L ${start.x.toFixed(2)} ${start.y.toFixed(2)}`,
    `A ${R} ${R} 0 ${large} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
    'Z',
  ].join(' ')
}

const split = computed(() => {
  const earned = Number(royalty.value?.totalRoyaltyEarned ?? 0)
  const pending = Number(royalty.value?.totalRoyaltyPending ?? 0)
  const total = earned + pending
  if (total <= 0) return null

  const earnedAngle = (earned / total) * 360
  const pct = (part) => Math.round((part / total) * 1000) / 10

  return {
    earned,
    pending,
    total,
    earnedPct: pct(earned),
    pendingPct: pct(pending),
    // A single 100% slice can't be drawn as an arc, so it becomes a full circle.
    full: earned === total ? 'earned' : pending === total ? 'pending' : null,
    earnedPath: earned > 0 && earned < total ? sector(0, earnedAngle) : null,
    pendingPath: pending > 0 && pending < total ? sector(earnedAngle, 360) : null,
  }
})

const chartLabel = computed(() =>
  split.value
    ? `Royalties: ${inr(split.value.earned)} earned, ${inr(split.value.pending)} remaining.`
    : 'No royalty data yet.',
)

onMounted(() => {
  load()
  // Royalty totals change slowly; a 15s refresh keeps the page current without hammering the API.
  timer = setInterval(() => !document.hidden && load(), 15000)
})
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem">
      <div>
        <h2 style="margin: 0">Dashboard</h2>
        <p class="muted">Royalties and sales across your titles, at a glance.</p>
      </div>
      <RouterLink to="/author/tickets"
        ><button type="button" class="ghost">My tickets</button></RouterLink
      >
    </div>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-else-if="loading" class="empty">Loading your dashboard…</div>
    <template v-else>
      <div class="card" style="margin-top: 1rem; padding: 1rem">
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
            <strong>{{ inr(royalty?.totalRoyaltyPending) }}</strong>
          </div>
          <div>
            <div class="muted" style="font-size: 0.75rem">Earned</div>
            <strong>{{ inr(royalty?.totalRoyaltyEarned) }}</strong>
          </div>
          <div>
            <div class="muted" style="font-size: 0.75rem">Copies sold</div>
            <strong>{{ num(royalty?.totalCopiesSold) }}</strong>
          </div>
          <div>
            <div class="muted" style="font-size: 0.75rem">Next payout date</div>
            <strong>{{ royalty?.nextPayoutDate || '—' }}</strong>
          </div>
        </div>
        <p v-if="royalty?.overdueBooks > 0" class="error" style="margin-bottom: 0">
          {{ royalty.overdueBooks }} title{{ royalty.overdueBooks === 1 ? ' is' : 's are' }} past
          the payout window. Our payments team is on it.
        </p>
      </div>

      <div class="card" style="margin-top: 1rem; padding: 1rem">
        <h3 style="margin-top: 0">Royalties Earned vs Remaining</h3>
        <div
          style="
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 1.75rem;
            justify-content: center;
          "
        >
          <svg
            :viewBox="`0 0 ${SIZE} ${SIZE}`"
            width="220"
            height="220"
            role="img"
            :aria-label="chartLabel"
            style="flex: 0 0 auto"
          >
            <template v-if="split">
              <circle v-if="split.full === 'earned'" :cx="CX" :cy="CY" :r="R" fill="var(--leaf)">
                <title>Earned {{ inr(split.earned) }} (100%)</title>
              </circle>
              <circle
                v-else-if="split.full === 'pending'"
                :cx="CX"
                :cy="CY"
                :r="R"
                fill="var(--warn)"
              >
                <title>Remaining {{ inr(split.pending) }} (100%)</title>
              </circle>
              <template v-else>
                <path v-if="split.earnedPath" :d="split.earnedPath" fill="var(--leaf)">
                  <title>Earned {{ inr(split.earned) }} ({{ split.earnedPct }}%)</title>
                </path>
                <path v-if="split.pendingPath" :d="split.pendingPath" fill="var(--warn)">
                  <title>Remaining {{ inr(split.pending) }} ({{ split.pendingPct }}%)</title>
                </path>
              </template>
            </template>
            <circle v-else :cx="CX" :cy="CY" :r="R" fill="var(--paper-2)" />
          </svg>

          <div style="flex: 1 1 220px; min-width: 200px">
            <template v-if="split">
              <div
                style="
                  display: flex;
                  align-items: baseline;
                  justify-content: space-between;
                  gap: 0.75rem;
                  padding: 0.5rem 0;
                  border-bottom: 1px solid var(--line);
                "
              >
                <span style="display: flex; align-items: center; gap: 0.5rem">
                  <span
                    style="
                      width: 10px;
                      height: 10px;
                      border-radius: 2px;
                      background: var(--leaf);
                      display: inline-block;
                    "
                  ></span>
                  Earned
                </span>
                <span>
                  <strong>{{ inr(split.earned) }}</strong>
                  <span class="muted" style="font-size: 0.8rem; margin-left: 0.35rem"
                    >{{ split.earnedPct }}%</span
                  >
                </span>
              </div>
              <div
                style="
                  display: flex;
                  align-items: baseline;
                  justify-content: space-between;
                  gap: 0.75rem;
                  padding: 0.5rem 0;
                  border-bottom: 1px solid var(--line);
                "
              >
                <span style="display: flex; align-items: center; gap: 0.5rem">
                  <span
                    style="
                      width: 10px;
                      height: 10px;
                      border-radius: 2px;
                      background: var(--warn);
                      display: inline-block;
                    "
                  ></span>
                  Remaining
                </span>
                <span>
                  <strong>{{ inr(split.pending) }}</strong>
                  <span class="muted" style="font-size: 0.8rem; margin-left: 0.35rem"
                    >{{ split.pendingPct }}%</span
                  >
                </span>
              </div>
              <div
                style="
                  display: flex;
                  align-items: baseline;
                  justify-content: space-between;
                  gap: 0.75rem;
                  padding: 0.5rem 0;
                "
              >
                <span class="muted">Total royalty</span>
                <strong>{{ inr(split.total) }}</strong>
              </div>
            </template>
            <p v-else class="muted" style="margin: 0">
              No royalties recorded yet. Once your first copies sell, the split shows up here.
            </p>
          </div>
        </div>
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
    </template>
  </div>
</template>
