import { useCallback } from 'react'
import { Panel } from '@xyflow/react'

import { useAgentChatUiStore } from '../store/agent-chat-ui-store'
import { useAgentChatEvents } from '../api/use-agent-chat-events'
import { useAgentChatThread } from '../api/use-agent-chat-thread'
import { AgentLauncherButton } from './AgentLauncherButton'
import { AgentMessageCard } from './AgentMessageCard'
import { AgentChatComposer } from './AgentChatComposer'

interface AgentChatOverlayProps {
  workflowId: string
}

export function AgentChatOverlay({ workflowId }: AgentChatOverlayProps) {
  const messageCardOpen = useAgentChatUiStore((state) => state.messageCardOpen)
  const composerOpen = useAgentChatUiStore((state) => state.composerOpen)
  const closeAll = useAgentChatUiStore((state) => state.closeAll)
  const openChat = useAgentChatUiStore((state) => state.openChat)
  const chatOpen = messageCardOpen || composerOpen
  const { error, isLoading, retry, thread } = useAgentChatThread(workflowId, chatOpen)
  useAgentChatEvents(thread?.id)

  const toggleChat = useCallback(() => {
    if (messageCardOpen || composerOpen) {
      closeAll()
      return
    }
    openChat()
  }, [closeAll, composerOpen, messageCardOpen, openChat])

  return (
    <>
      <Panel
        position="top-left"
        className="mina-wc-agent-panel nodrag nowheel nopan pointer-events-auto"
        data-mina-canvas-ignore="true"
        data-mina-canvas-panel-root="true"
      >
        {messageCardOpen ? (
          <AgentMessageCard
            onClose={closeAll}
            onThreadRetry={retry}
            threadError={error}
            threadId={thread?.id}
            threadLoading={isLoading}
          />
        ) : (
          <AgentLauncherButton active={composerOpen} onClick={toggleChat} />
        )}
      </Panel>
      {composerOpen ? (
        <Panel
          position="bottom-center"
          className="mina-wc-agent-composer-panel nodrag nowheel nopan pointer-events-auto"
          data-mina-canvas-ignore="true"
          data-mina-canvas-panel-root="true"
        >
          <AgentChatComposer threadId={thread?.id} />
        </Panel>
      ) : null}
    </>
  )
}
