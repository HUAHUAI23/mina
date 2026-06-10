import { webEnv } from '../../../../config/env'

export const getAgentChatClientId = (): string => {
  const key = 'mina.agentChat.clientId'
  const existing = sessionStorage.getItem(key)
  if (existing) {
    return existing
  }
  const created = crypto.randomUUID()
  sessionStorage.setItem(key, created)
  return created
}

export const chatEventUrl = (threadId: string): string => {
  const base = webEnv.apiBaseUrl === '/' ? window.location.origin : webEnv.apiBaseUrl
  const url = new URL(`/api/chat/threads/${encodeURIComponent(threadId)}/events`, base)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}
