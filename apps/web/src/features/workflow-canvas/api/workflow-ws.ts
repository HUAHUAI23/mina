import { WorkflowEventSchema, type WorkflowEvent } from '@mina/contracts/modules/workflows/events'

import { webEnv } from '../../../config/env'

export const getWorkflowClientId = (): string => {
  const key = 'mina.workflow.clientId'
  const existing = sessionStorage.getItem(key)
  if (existing) {
    return existing
  }
  const created = crypto.randomUUID()
  sessionStorage.setItem(key, created)
  return created
}

export const workflowEventUrl = (workflowId: string): string => {
  const base = webEnv.apiBaseUrl === '/' ? window.location.origin : webEnv.apiBaseUrl
  const url = new URL(`/api/workflows/${workflowId}/events`, base)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

export const parseWorkflowEvent = (value: string): WorkflowEvent | undefined => {
  const parsed = WorkflowEventSchema.safeParse(JSON.parse(value))
  return parsed.success ? parsed.data : undefined
}
