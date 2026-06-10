import { ChatEventSchema, type ChatEvent } from '@mina/contracts/modules/chat'

export const parseChatEvent = (value: string): ChatEvent | undefined => {
  try {
    const parsed = ChatEventSchema.safeParse(JSON.parse(value))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}
