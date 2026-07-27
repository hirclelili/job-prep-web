export const AGENT_ARTIFACT_EVENT = 'job-prep-agent-artifact'
const LAST_ARTIFACT_KEY = 'job_prep_last_agent_artifact'

export function emitAgentArtifact(artifact) {
  const payload = {
    ...artifact,
    id: artifact.id || `artifact-${Date.now()}`,
    createdAt: new Date().toISOString(),
  }

  try {
    localStorage.setItem(LAST_ARTIFACT_KEY, JSON.stringify(payload))
  } catch {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AGENT_ARTIFACT_EVENT, { detail: payload }))
  }

  return payload
}

export function subscribeAgentArtifacts(handler) {
  if (typeof window === 'undefined') return () => {}
  const listener = event => handler(event.detail)
  window.addEventListener(AGENT_ARTIFACT_EVENT, listener)
  return () => window.removeEventListener(AGENT_ARTIFACT_EVENT, listener)
}

export function getLastAgentArtifact() {
  try {
    return JSON.parse(localStorage.getItem(LAST_ARTIFACT_KEY)) || null
  } catch {
    return null
  }
}
