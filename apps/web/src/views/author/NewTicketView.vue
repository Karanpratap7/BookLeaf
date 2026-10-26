<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../../api'

const router = useRouter()
const books = ref([])
const bookId = ref('')
const subject = ref('')
const description = ref('')
const fileName = ref('')
const error = ref('')
const loading = ref(false)

onMounted(async () => {
  try {
    books.value = await api.myBooks()
  } catch (e) {
    error.value = e.message
  }
})

function onFile(e) {
  fileName.value = e.target.files?.[0]?.name || ''
}

async function submit() {
  error.value = ''
  loading.value = true
  try {
    const ticket = await api.createTicket({
      subject: subject.value,
      description: description.value,
      bookId: bookId.value || null,
    })
    router.push(`/author/tickets/${ticket.id}`)
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div style="max-width: 640px">
    <h2 style="margin-top: 0">Submit a Support Query</h2>
    <div v-if="error" class="error">{{ error }}</div>
    <form class="card" @submit.prevent="submit">
      <div class="field">
        <label>Book</label>
        <select v-model="bookId">
          <option value="">General / Account Level</option>
          <option v-for="b in books" :key="b.id" :value="b.id">{{ b.title }}</option>
        </select>
      </div>
      <div class="field">
        <label>Subject</label>
        <input v-model="subject" required maxlength="200" placeholder="Short summary of your issue" />
      </div>
      <div class="field">
        <label>Description</label>
        <textarea v-model="description" required placeholder="Share details, dates, and what you need help with" />
      </div>
      <div class="field">
        <label>Attachment (UI only)</label>
        <input type="file" @change="onFile" />
        <div v-if="fileName" class="muted" style="font-size: 0.85rem; margin-top: 0.35rem">
          Selected: {{ fileName }} (not uploaded — demo UI only)
        </div>
      </div>
      <button type="submit" :disabled="loading">{{ loading ? 'Submitting…' : 'Submit ticket' }}</button>
    </form>
  </div>
</template>
