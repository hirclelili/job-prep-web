const AGENT_MEMORY_KEY = 'job_prep_agent_memory'
const AGENT_THREAD_KEY = 'job_prep_agent_thread'
export const DEFAULT_AGENT_THREAD_ID = 'global'

function getThreadKey(threadId = DEFAULT_AGENT_THREAD_ID) {
  const safeId = String(threadId || DEFAULT_AGENT_THREAD_ID).replace(/[^\w:.-]/g, '_')
  return safeId === DEFAULT_AGENT_THREAD_ID ? AGENT_THREAD_KEY : `${AGENT_THREAD_KEY}:${safeId}`
}

export function getAgentMemory() {
  try {
    return JSON.parse(localStorage.getItem(AGENT_MEMORY_KEY)) || {
      preferences: [],
      goals: [],
      notes: [],
      updatedAt: null,
    }
  } catch {
    return { preferences: [], goals: [], notes: [], updatedAt: null }
  }
}

export function saveAgentMemory(patch) {
  const current = getAgentMemory()
  const next = {
    ...current,
    ...patch,
    preferences: patch.preferences || current.preferences || [],
    goals: patch.goals || current.goals || [],
    notes: patch.notes || current.notes || [],
    updatedAt: new Date().toISOString(),
  }
  localStorage.setItem(AGENT_MEMORY_KEY, JSON.stringify(next))
  return next
}

export function appendAgentMemoryNote(note) {
  const current = getAgentMemory()
  const trimmed = String(note || '').trim()
  if (!trimmed) return current
  return saveAgentMemory({
    notes: [
      { id: `note-${Date.now()}`, text: trimmed, createdAt: new Date().toISOString() },
      ...(current.notes || []),
    ].slice(0, 80),
  })
}

export function getAgentThread(threadId = DEFAULT_AGENT_THREAD_ID) {
  try {
    return JSON.parse(localStorage.getItem(getThreadKey(threadId))) || []
  } catch {
    return []
  }
}

export function saveAgentThread(messages, threadId = DEFAULT_AGENT_THREAD_ID) {
  localStorage.setItem(getThreadKey(threadId), JSON.stringify((messages || []).slice(-60)))
}

export function clearAgentThread(threadId = DEFAULT_AGENT_THREAD_ID) {
  localStorage.removeItem(getThreadKey(threadId))
}
