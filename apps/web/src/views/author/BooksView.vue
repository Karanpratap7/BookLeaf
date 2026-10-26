<script setup>
import { onMounted, ref } from 'vue'
import { api } from '../../api'

const books = ref([])
const error = ref('')
const loading = ref(true)

function money(n) {
  if (n == null) return '—'
  return `₹${Number(n).toLocaleString('en-IN')}`
}

function date(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN')
}

onMounted(async () => {
  try {
    books.value = await api.myBooks()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <h2 style="margin-top: 0">My Books</h2>
    <p class="muted">Published titles, royalties, and production status.</p>
    <div v-if="error" class="error">{{ error }}</div>
    <div v-else-if="loading" class="empty">Loading books…</div>
    <div v-else-if="!books.length" class="empty">No books found.</div>
    <div v-else class="card table-wrap" style="padding: 0.5rem 1rem">
      <table class="table">
        <thead>
          <tr>
            <th>Title</th>
            <th>ISBN</th>
            <th>Genre</th>
            <th>Published</th>
            <th>Status</th>
            <th>MRP</th>
            <th>Sold</th>
            <th>Earned</th>
            <th>Paid</th>
            <th>Pending</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in books" :key="b.id">
            <td><strong>{{ b.title }}</strong></td>
            <td>{{ b.isbn || '—' }}</td>
            <td>{{ b.genre || '—' }}</td>
            <td>{{ date(b.publicationDate) }}</td>
            <td><span class="badge">{{ b.status }}</span></td>
            <td>{{ money(b.mrp) }}</td>
            <td>{{ b.totalCopiesSold }}</td>
            <td>{{ money(b.totalRoyaltyEarned) }}</td>
            <td>{{ money(b.royaltyPaid) }}</td>
            <td>{{ money(b.royaltyPending) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
