import { useCallback, useEffect, useRef, useState } from 'react'
import '@xyflow/react/dist/style.css'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

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
import { CanvasToolbar } from './CanvasToolbar'
import { SaveStatusPill } from './SaveStatusPill'
import { WorkflowCanvas } from './WorkflowCanvas'

interface WorkflowCanvasPageProps {
  workflowId: string
}

export function WorkflowCanvasPage({ workflowId }: WorkflowCanvasPageProps) {
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
  const addNode = useCanvasStore((state) => state.addNode)
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
    onError: (error) => setRunError(error instanceof Error ? error.message : 'Run failed.'),
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
    return <div className="mina-wc-page"><div className="mina-wc-loading">Loading workflow</div></div>
  }

  if (workflowQuery.isError || !workflowQuery.data) {
    return <div className="mina-wc-page"><div className="mina-wc-loading">Workflow unavailable</div></div>
  }

  const workflow = workflowQuery.data.item

  return (
    <div className="mina-wc-page">
      <header className="mina-wc-header">
        <div className="mina-wc-title-group">
          <Link aria-label="Back to canvas list" className="mina-wc-back" to="/canvas">
            <ArrowLeft aria-hidden="true" size={17} />
          </Link>
          <div className="mina-wc-title-copy">
            <span>Canvas</span>
            <h1>{workflow.name}</h1>
          </div>
        </div>
        <div className="mina-wc-header-actions">
          <SaveStatusPill yjsConnectionStatus={yjsConnectionStatus} />
        </div>
      </header>

      <section className="mina-wc-stage" aria-label="Workflow canvas">
        <WorkflowCanvas
          onRunNode={runNode}
          onSelectOutput={selectOutput}
          runError={runError}
          runningNodeId={runningNodeId}
        />
        <CanvasToolbar onAddNode={addNode} />
      </section>
    </div>
  )
}
