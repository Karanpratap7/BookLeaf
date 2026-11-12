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

// Ask-first panel state
const askLoading = ref(false)
const askResult = ref(null)
const askError = ref('')

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

async function askPolicy() {
  if (!subject.value.trim() || !description.value.trim()) {
    askError.value = 'Please enter a subject and description first.'
    return
  }
  askError.value = ''
  askLoading.value = true
  askResult.value = null
  try {
    const question = `Subject: ${subject.value}\n\n${description.value}`
    const res = await api.askPolicy(question, bookId.value || null)
    askResult.value = res
  } catch (e) {
    askError.value = e.details?.map((d) => d.message).join('. ') || e.message
  } finally {
    askLoading.value = false
  }
}

function clearAskResult() {
  askResult.value = null
  askError.value = ''
}

function useAskResultForTicket() {
  // The ask result already has the subject/description pre-filled, just clear the panel
  clearAskResult()
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
    error.value = e.details?.map((d) => d.message).join('. ') || e.message
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
        <input
          v-model="subject"
          required
          minlength="3"
          maxlength="200"
          placeholder="Short summary of your issue"
        />
      </div>
      <div class="field">
        <label>Description</label>
        <textarea
          v-model="description"
          required
          minlength="10"
          maxlength="5000"
          placeholder="Share details, dates, and what you need help with"
        />
      </div>
      <div class="field">
        <label>Attachment (UI only)</label>
        <input type="file" @change="onFile" />
        <div v-if="fileName" class="muted" style="font-size: 0.85rem; margin-top: 0.35rem">
          Selected: {{ fileName }} (not uploaded — demo UI only)
        </div>
      </div>

      <!-- Ask First Panel -->
      <div
        v-if="!askLoading && !askResult"
        style="
          margin-top: 1rem;
          padding: 1rem;
          background: #f5f9ff;
          border-radius: 8px;
          border: 1px solid #cce0ff;
        "
      >
        <button
          type="button"
          @click="askPolicy"
          :disabled="!subject.value.trim() || !description.value.trim()"
          style="
            width: 100%;
            padding: 0.75rem;
            background: #0066cc;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
          "
        >
          💡 Ask First — Get an instant answer from our knowledge base
        </button>
        <p class="muted" style="font-size: 0.85rem; margin-top: 0.5rem; text-align: center">
          We'll search our policies and your account data. If we can't answer, you can still file a
          ticket.
        </p>
        <div v-if="askError" class="error" style="margin-top: 0.5rem">{{ askError }}</div>
      </div>

      <div
        v-else-if="askResult && !askResult.answered"
        style="
          margin-top: 1rem;
          padding: 1rem;
          background: #fff8f0;
          border-radius: 8px;
          border: 1px solid #ffd8a8;
        "
      >
        <div style="font-weight: 600; margin-bottom: 0.5rem">
          Your question appears to be about a topic not covered by our knowledge base.
        </div>
        <p class="muted" style="font-size: 0.9rem; margin-bottom: 0.75rem">
          Would you like to file a ticket instead? Our team will investigate and get back to you.
        </p>
        <div style="display: flex; gap: 0.5rem">
          <button
            type="button"
            @click="clearAskResult"
            style="
              flex: 1;
              padding: 0.5rem;
              background: white;
              border: 1px solid #ccc;
              border-radius: 6px;
              cursor: pointer;
            "
          >
            Go back & edit
          </button>
          <button
            type="submit"
            :disabled="loading"
            style="
              flex: 1;
              padding: 0.5rem;
              background: #0066cc;
              color: white;
              border: none;
              border-radius: 6px;
              cursor: pointer;
              font-weight: 600;
            "
          >
            {{ loading ? 'Submitting…' : 'Raise a ticket' }}
          </button>
        </div>
        <div v-if="askError" class="error" style="margin-top: 0.5rem">{{ askError }}</div>
      </div>

      <div
        v-else-if="askResult && askResult.answered"
        style="
          margin-top: 1rem;
          padding: 1rem;
          background: #f0fff4;
          border-radius: 8px;
          border: 1px solid #a8ffc8;
        "
      >
        <div style="font-weight: 600; margin-bottom: 0.5rem">Answer</div>
        <div style="white-space: pre-wrap; line-height: 1.6; margin-bottom: 0.75rem">
          {{ askResult.answer }}
        </div>
        <div
          v-if="askResult.sources && askResult.sources.length"
          style="display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.5rem"
        >
          <span class="muted" style="font-size: 0.8rem">Sources:</span>
          <span
            v-for="s in askResult.sources"
            :key="s.title"
            style="
              font-size: 0.75rem;
              padding: 0.2rem 0.5rem;
              background: #e8f5e9;
              border-radius: 999px;
              border: 1px solid #a8ffc8;
            "
          >
            {{ s.title }}{{ s.category ? ` (${s.category})` : '' }}
          </span>
        </div>
        <div class="muted" style="font-size: 0.8rem">Model: {{ askResult.model }}</div>
        <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem">
          <button
            type="button"
            @click="clearAskResult"
            style="
              flex: 1;
              padding: 0.5rem;
              background: white;
              border: 1px solid #ccc;
              border-radius: 6px;
              cursor: pointer;
            "
          >
            Edit question & ask again
          </button>
          <button
            type="submit"
            :disabled="loading"
            style="
              flex: 1;
              padding: 0.5rem;
              background: #0066cc;
              color: white;
              border: none;
              border-radius: 6px;
              cursor: pointer;
              font-weight: 600;
            "
          >
            {{ loading ? 'Submitting…' : 'Still file a ticket' }}
          </button>
        </div>
      </div>

      <div v-if="!askResult" style="margin-top: 1rem">
        <button type="submit" :disabled="loading">
          {{ loading ? 'Submitting…' : 'Submit ticket' }}
        </button>
      </div>
    </form>
  </div>
</template>
