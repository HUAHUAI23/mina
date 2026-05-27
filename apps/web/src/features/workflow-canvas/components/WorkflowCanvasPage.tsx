import { useCallback, useEffect, useRef, useState } from 'react'
import '@xyflow/react/dist/style.css'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { useMessages } from '../../../app/i18n-provider'
import { taskKeys, workflowKeys } from '../api/workflow-keys'
import {
  createWorkflowRun,
  getWorkflow,
} from '../api/workflow-queries'
import { getWorkflowClientId, parseWorkflowEvent, workflowEventUrl } from '../api/workflow-ws'
import { useCanvasStore } from '../store/canvas-store'
import { incrementCanvasPerfCounter } from '../diagnostics/canvas-performance-marks'
import { useCanvasUiStore } from '../store/canvas-ui-store'
import { useWorkflowYjsSync } from '../sync/yjs/yjs-sync'
import { SaveStatusPill } from './SaveStatusPill'
import { WorkflowCanvas } from './WorkflowCanvas'

interface WorkflowCanvasPageProps {
  workflowId: string
}

const pageShellClassName = 'relative h-dvh w-screen min-w-0 overflow-hidden bg-surface text-foreground'
const loadingShellClassName = 'grid h-dvh w-screen place-items-center overflow-hidden bg-surface text-foreground'
const loadingClassName = 'p-2.5 text-[0.74rem] font-bold text-foreground-quaternary'
const headerClassName = 'pointer-events-none absolute inset-x-0 top-0 z-30 flex min-w-0 items-start justify-between gap-3 bg-linear-to-b from-surface/90 via-surface/45 to-transparent px-[clamp(16px,3dvw,34px)] pt-4 pb-12'
const titleGroupClassName = 'pointer-events-auto flex max-w-[min(72vw,560px)] min-w-0 items-center gap-3 rounded-full bg-surface-container-lowest/90 p-1.5 pr-5 shadow-[0_20px_40px_-24px_color-mix(in_oklch,var(--foreground)_18%,transparent),inset_0_0_0_1px_var(--outline-ghost)]'
const headerActionsClassName = 'pointer-events-auto flex min-w-0 flex-none items-center justify-end gap-3'
const backLinkClassName = 'flex size-10.5 flex-none items-center justify-center rounded-full bg-surface-container-lowest text-foreground-tertiary shadow-[inset_0_0_0_1px_var(--outline-ghost)] hover:bg-foreground hover:text-primary-foreground'
const titleCopyClassName = 'grid min-w-0 gap-0.5'
const titleEyebrowClassName = 'text-[0.62rem] leading-none font-black tracking-[0.24em] text-foreground-quaternary uppercase'
const titleClassName = 'm-0 truncate font-display text-base leading-[1.15] font-black tracking-normal'
const stageClassName = 'absolute inset-0 min-w-0 overflow-hidden bg-surface-container-low'

export function WorkflowCanvasPage({ workflowId }: WorkflowCanvasPageProps) {
  const m = useMessages()
  const queryClient = useQueryClient()
  const [runError, setRunError] = useState<string>()
  const [runningNodeId, setRunningNodeId] = useState<string>()
  const workflowQuery = useQuery({
    queryFn: () => getWorkflow(workflowId),
    queryKey: workflowKeys.detail(workflowId),
  })
  const version = useCanvasStore((state) => state.version)
  const yjsConnectionStatus = useCanvasStore((state) => state.yjsConnectionStatus)
  const hydratedWorkflowId = useCanvasStore((state) => state.hydratedWorkflowId)
  const hydrateFromServer = useCanvasStore((state) => state.hydrateFromServer)
  const setNodeMediaView = useCanvasStore((state) => state.setNodeMediaView)
  const selectedNodeIds = useCanvasUiStore((state) => state.selectedNodeIds)
  const eventRuntimeRef = useRef({
    selectedNodeId: selectedNodeIds[0],
    version,
  })
  eventRuntimeRef.current = {
    selectedNodeId: selectedNodeIds[0],
    version,
  }
  useWorkflowYjsSync(workflowId)

  useEffect(() => {
    const workflow = workflowQuery.data?.item
    if (!workflow) {
      return
    }
    if (!hydratedWorkflowId || hydratedWorkflowId !== workflow.id || workflow.version > version) {
      hydrateFromServer({
        workflowId: workflow.id,
        version: workflow.version,
        name: workflow.name,
        nodes: workflow.nodes,
        edges: workflow.edges,
      })
    }
  }, [hydrateFromServer, hydratedWorkflowId, version, workflowQuery.data])

  useEffect(() => {
    const clientId = getWorkflowClientId()
    incrementCanvasPerfCounter('websocketReconnects')
    const socket = new WebSocket(workflowEventUrl(workflowId))
    socket.onmessage = (message) => {
      if (typeof message.data !== 'string') {
        return
      }
      const event = parseWorkflowEvent(message.data)
      if (!event || event.workflowId !== workflowId || event.sourceClientId === clientId) {
        return
      }
      const { selectedNodeId } = eventRuntimeRef.current
      if (event.type === 'workflow.definition.updated') {
        return
      }
      void queryClient.invalidateQueries({ queryKey: workflowKeys.detail(workflowId) })
      if (event.type === 'workflow.node.task.updated' && selectedNodeId === event.payload.nodeId) {
        void queryClient.invalidateQueries({ queryKey: workflowKeys.nodeTasks(workflowId, event.payload.nodeId) })
      }
      if (event.type === 'workflow.run.updated') {
        void queryClient.invalidateQueries({ queryKey: workflowKeys.runs(workflowId) })
      }
    }
    return () => {
      socket.onmessage = null
      if (socket.readyState === WebSocket.CONNECTING) {
        socket.addEventListener('open', () => socket.close(), { once: true })
        return
      }
      socket.close()
    }
  }, [queryClient, workflowId])

  const runMutation = useMutation({
    mutationFn: async (nodeId: string) => createWorkflowRun(workflowId, { selectedNodeId: nodeId }),
    onMutate: (nodeId) => {
      setRunError(undefined)
      setRunningNodeId(nodeId)
    },
    onSettled: () => setRunningNodeId(undefined),
    onSuccess: (response) => {
      setRunError(undefined)
      void queryClient.invalidateQueries({ queryKey: workflowKeys.runs(workflowId) })
      for (const nodeId of Object.keys(response.item.nodeStates)) {
        void queryClient.invalidateQueries({ queryKey: workflowKeys.nodeTasks(workflowId, nodeId) })
      }
    },
    onError: (error) => setRunError(error instanceof Error ? error.message : m.workflow_canvas_run_failed()),
  })

  const runNode = useCallback((nodeId: string) => runMutation.mutate(nodeId), [runMutation])

  const selectOutput = useCallback(
    (nodeId: string, taskId: string, outputResourceId: string, outputIndex: number) => {
      setNodeMediaView(nodeId, {
        taskId,
        outputResourceId,
        outputIndex,
      })
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) })
    },
    [queryClient, setNodeMediaView],
  )

  if (workflowQuery.isLoading) {
    return <div className={loadingShellClassName}><div className={loadingClassName}>{m.workflow_canvas_loading()}</div></div>
  }

  if (workflowQuery.isError || !workflowQuery.data) {
    return <div className={loadingShellClassName}><div className={loadingClassName}>{m.workflow_canvas_unavailable()}</div></div>
  }

  const workflow = workflowQuery.data.item

  return (
    <div className={pageShellClassName}>
      <section className={stageClassName} aria-label={m.workflow_canvas_label()}>
        <WorkflowCanvas
          onRunNode={runNode}
          onSelectOutput={selectOutput}
          runError={runError}
          runningNodeId={runningNodeId}
        />
      </section>

      <header className={headerClassName}>
        <div className={titleGroupClassName}>
          <Link aria-label={m.workflow_canvas_back_to_list()} className={backLinkClassName} to="/projects">
            <ArrowLeft aria-hidden="true" size={17} />
          </Link>
          <div className={titleCopyClassName}>
            <span className={titleEyebrowClassName}>{m.workflow_canvas_eyebrow()}</span>
            <h1 className={titleClassName}>{workflow.name}</h1>
          </div>
        </div>
        <div className={headerActionsClassName}>
          <SaveStatusPill yjsConnectionStatus={yjsConnectionStatus} />
        </div>
      </header>
    </div>
  )
}
