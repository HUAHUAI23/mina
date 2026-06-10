import { Bot } from 'lucide-react'
import { Button } from '@mina/ui/components/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@mina/ui/components/tooltip'

import { useMessages } from '../../../../app/i18n-provider'

interface AgentLauncherButtonProps {
  active: boolean
  onClick(): void
}

export function AgentLauncherButton({ active, onClick }: AgentLauncherButtonProps) {
  const m = useMessages()
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={active ? m.workflow_canvas_agent_close() : m.workflow_canvas_agent_open()}
            aria-pressed={active}
            className="mina-wc-floating-surface size-11 rounded-xl border border-border bg-surface-container-lowest text-foreground shadow-floating hover:bg-surface-container-low"
            onClick={onClick}
            size="icon-lg"
            type="button"
            variant="ghost"
          >
            <Bot aria-hidden="true" className="size-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">{m.workflow_canvas_agent_open()}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
