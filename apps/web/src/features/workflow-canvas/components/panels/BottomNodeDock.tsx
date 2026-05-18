import { useState } from 'react'
import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import { NodeConfigCard } from './NodeConfigCard'
import { TaskHistoryCard } from './TaskHistoryCard'

interface BottomNodeDockProps {
  node?: WorkflowCanvasNode | undefined
  nodes: WorkflowCanvasNode[]
  onRun(): void
  runError?: string | undefined
  running?: boolean | undefined
  workflowId: string
}

export function BottomNodeDock({ node, nodes, onRun, runError, running, workflowId }: BottomNodeDockProps) {
  const [tab, setTab] = useState<'config' | 'history'>('config')
  const wide = typeof window !== 'undefined' && window.innerWidth > 980
  if (!node) {
    return null
  }
  return (
    <aside className="mina-wc-bottom-dock" aria-label="Selected node operations">
      <div className="mina-wc-dock-tabs">
        <button data-active={tab === 'config' ? 'true' : undefined} onClick={() => setTab('config')} type="button">
          Config
        </button>
        <button data-active={tab === 'history' ? 'true' : undefined} onClick={() => setTab('history')} type="button">
          History
        </button>
      </div>
      <div className="mina-wc-dock-grid">
        {tab === 'config' || wide ? (
          <NodeConfigCard node={node} nodes={nodes} onRun={onRun} runError={runError} running={running} />
        ) : null}
        {(tab === 'history' || wide) &&
        (node.data.nodeType === 'image_generation' || node.data.nodeType === 'video_generation') ? (
          <TaskHistoryCard node={node} open={tab === 'history' || wide} workflowId={workflowId} />
        ) : null}
      </div>
    </aside>
  )
}
