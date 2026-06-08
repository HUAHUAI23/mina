import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import { Boxes, FolderInput, GitBranch, LogOut, Trash2, type LucideIcon } from 'lucide-react'
import { cn } from '@mina/ui/lib/utils'

import { useMessages } from '../../../../app/i18n-provider'
import { useCanvasStore } from '../../store/canvas-store'
import { selectWorkflowCanvasNodes } from '../../store/canvas-selection-actions'
import type { ComposerSurface } from '../types'

interface MultiSelectionBlockProps {
  nodeIds: string[]
  surface: Exclude<ComposerSurface, 'hidden'>
}

interface MultiActionButtonProps {
  destructive?: boolean | undefined
  icon: LucideIcon
  label: string
  onClick(): void
}

const panelClassName = 'mina-wc-multi-panel flex min-h-[62px] min-w-0 items-center justify-between gap-4 max-[720px]:grid max-[720px]:gap-3'
const summaryClassName = 'grid min-w-0 gap-[3px]'
const selectedCountClassName = 'text-[0.95rem] leading-tight text-foreground'
const batchLabelClassName = 'text-[0.66rem] font-extrabold tracking-[0.14em] text-foreground-quaternary uppercase'
const actionBarClassName = 'flex min-w-0 items-center gap-1.5 max-[720px]:overflow-x-auto'
const actionGroupClassName = 'flex flex-none items-center gap-0.5 rounded-full bg-[color-mix(in_oklch,var(--surface-container-lowest)_48%,transparent)] p-1 ring-1 ring-border/30'
const actionButtonClassName = 'flex size-10 items-center justify-center rounded-full border-0 bg-transparent text-foreground-tertiary hover:bg-surface-container-lowest/72 hover:text-foreground focus-visible:bg-surface-container-lowest focus-visible:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-primary/30'
const destructiveButtonClassName = 'text-destructive/72 hover:bg-destructive/8 hover:text-destructive focus-visible:bg-destructive/8 focus-visible:text-destructive'

function MultiActionButton({ destructive, icon: Icon, label, onClick }: MultiActionButtonProps) {
  return (
    <button
      className={cn(actionButtonClassName, destructive && destructiveButtonClassName)}
      onClick={onClick}
      type="button"
      title={label}
      aria-label={label}
    >
      <Icon aria-hidden="true" size={17} />
    </button>
  )
}

export function MultiSelectionBlock({ nodeIds }: MultiSelectionBlockProps) {
  const m = useMessages()
  const addNodesToGroup = useCanvasStore((state) => state.addNodesToGroup)
  const detachGraphNodes = useCanvasStore((state) => state.detachGraphNodes)
  const groupGraphNodes = useCanvasStore((state) => state.groupGraphNodes)
  const nodes = useCanvasStore((state) => state.nodes)
  const removeGraphNodes = useCanvasStore((state) => state.removeGraphNodes)
  const selectedNodes = nodeIds
    .map((nodeId) => nodes.find((node) => node.id === nodeId))
    .filter((node): node is WorkflowCanvasNode => Boolean(node))
  const selectedGroup = selectedNodes.find((node) => node.data.nodeType === 'flow_group' || node.data.nodeType === 'node_group')
  const attachableNodeIds = selectedGroup
    ? selectedNodes
      .filter((node) => node.id !== selectedGroup.id && node.parentId !== selectedGroup.id)
      .filter((node) => node.data.nodeType !== 'flow_group' && node.data.nodeType !== 'node_group')
      .map((node) => node.id)
    : []

  return (
    <section className={panelClassName} aria-label={m.workflow_canvas_multi_selection()}>
      <div className={summaryClassName}>
        <strong className={selectedCountClassName}>{m.workflow_canvas_selected_count({ count: nodeIds.length })}</strong>
        <span className={batchLabelClassName}>{m.workflow_canvas_batch_actions()}</span>
      </div>
      <div className={actionBarClassName}>
        <div className={actionGroupClassName}>
          <MultiActionButton
            icon={Boxes}
            label={m.workflow_canvas_group_selected()}
            onClick={() => {
              const groupId = groupGraphNodes(nodeIds, 'node_group')
              if (groupId) {
                selectWorkflowCanvasNodes([groupId])
              }
            }}
          />
          <MultiActionButton
            icon={GitBranch}
            label={m.workflow_canvas_create_flow_group()}
            onClick={() => {
              const groupId = groupGraphNodes(nodeIds, 'flow_group')
              if (groupId) {
                selectWorkflowCanvasNodes([groupId])
              }
            }}
          />
          {selectedGroup && attachableNodeIds.length > 0 ? (
            <MultiActionButton
              icon={FolderInput}
              label={m.workflow_canvas_attach_to_group()}
              onClick={() => {
                const attachedIds = addNodesToGroup(selectedGroup.id, attachableNodeIds)
                if (attachedIds.length > 0) {
                  selectWorkflowCanvasNodes([selectedGroup.id])
                }
              }}
            />
          ) : null}
        </div>
        <div className={actionGroupClassName}>
          <MultiActionButton
            icon={LogOut}
            label={m.workflow_canvas_detach_selected()}
            onClick={() => detachGraphNodes(nodeIds)}
          />
          <MultiActionButton
            destructive
            icon={Trash2}
            label={m.workflow_canvas_delete_selected()}
            onClick={() => {
              removeGraphNodes(nodeIds)
              selectWorkflowCanvasNodes([])
            }}
          />
        </div>
      </div>
    </section>
  )
}
