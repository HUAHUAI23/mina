import { useCallback, useEffect, useRef, useState } from 'react'
import '@xyflow/react/dist/style.css'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { taskKeys, workflowKeys } from '../api/workflow-keys'
import {
  createWorkflowRun,
  getWorkflow,
  getWorkflowCollaborationSnapshot,
  patchNodeMediaView,
} from '../api/workflow-queries'
import { getWorkflowClientId, parseWorkflowEvent, workflowEventUrl } from '../api/workflow-ws'
import { getCanvasSnapshot, useCanvasStore } from '../store/canvas-store'
import { incrementCanvasPerfCounter } from '../diagnostics/canvas-performance-marks'
import { webEnv } from '../../../config/env'
import { useCanvasUiStore } from '../store/canvas-ui-store'
import { useWorkflowAutosave } from '../hooks/use-workflow-autosave'
import { useWorkflowYjsShadowSync } from '../sync/yjs/yjs-shadow-sync'
import { CanvasToolbar } from './CanvasToolbar'
import { RemoteUpdateBanner } from './RemoteUpdateBanner'
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
  const collaborationSnapshotQuery = useQuery({
    enabled: webEnv.workflowCanvasSyncMode === 'primary',
    queryFn: () => getWorkflowCollaborationSnapshot(workflowId),
    queryKey: [...workflowKeys.detail(workflowId), 'collaboration-snapshot'] as const,
  })
  const dirty = useCanvasStore((state) => state.dirty)
  const saving = useCanvasStore((state) => state.saving)
  const version = useCanvasStore((state) => state.version)
  const hydratedWorkflowId = useCanvasStore((state) => state.hydratedWorkflowId)
  const remoteUpdatePending = useCanvasStore((state) => state.remoteUpdatePending)
  const addNode = useCanvasStore((state) => state.addNode)
  const hydrateFromServer = useCanvasStore((state) => state.hydrateFromServer)
  const selectedNodeIds = useCanvasUiStore((state) => state.selectedNodeIds)
  const setRemoteUpdate = useCanvasStore((state) => state.setRemoteUpdate)
  const applyRemoteMediaView = useCanvasStore((state) => state.applyRemoteMediaView)
  const eventRuntimeRef = useRef({
    dirty,
    selectedNodeId: selectedNodeIds[0],
    version,
  })
  eventRuntimeRef.current = {
    dirty,
    selectedNodeId: selectedNodeIds[0],
    version,
  }
  useWorkflowYjsShadowSync(workflowId, webEnv.workflowCanvasSyncMode !== 'disabled')

  useEffect(() => {
    const workflow = workflowQuery.data?.item
    if (!workflow) {
      return
    }
    const collaborationSnapshot =
      webEnv.workflowCanvasSyncMode === 'primary' ? collaborationSnapshotQuery.data?.item : undefined
    const graph = collaborationSnapshot ?? workflow
    const graphVersion = collaborationSnapshot?.version ?? workflow.version
    if (!hydratedWorkflowId || hydratedWorkflowId !== workflow.id || (!dirty && graphVersion > version)) {
      hydrateFromServer({
        workflowId: workflow.id,
        version: graphVersion,
        name: workflow.name,
        nodes: graph.nodes,
        edges: graph.edges,
      })
    }
  }, [collaborationSnapshotQuery.data, dirty, hydrateFromServer, hydratedWorkflowId, version, workflowQuery.data])

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
      const { dirty: hasLocalChanges, selectedNodeId, version: currentVersion } = eventRuntimeRef.current
      if (hasLocalChanges) {
        setRemoteUpdate(event.version ?? currentVersion)
        return
      }
      if (event.type === 'workflow.node.mediaView.updated') {
        applyRemoteMediaView(event.payload.nodeId, event.payload.mediaView, event.version ?? currentVersion)
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
  }, [applyRemoteMediaView, queryClient, setRemoteUpdate, workflowId])

  const { saveNow, saveNowAsync } = useWorkflowAutosave({
    fallbackName: workflowQuery.data?.item.name,
    onError: setRunError,
    workflowId,
  })

  const runMutation = useMutation({
    mutationFn: async (nodeId: string) => {
      let currentVersion = getCanvasSnapshot().version
      if (getCanvasSnapshot().dirty) {
        const saved = await saveNowAsync()
        currentVersion = saved.response.item.version
      }
      return createWorkflowRun(workflowId, { selectedNodeId: nodeId, expectedWorkflowVersion: currentVersion })
    },
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

  const mediaViewMutation = useMutation({
    mutationFn: (input: { nodeId: string; outputIndex: number; outputResourceId: string; taskId: string }) =>
      patchNodeMediaView(workflowId, input.nodeId, {
        expectedWorkflowVersion: getCanvasSnapshot().version,
        mediaView: {
          taskId: input.taskId,
          outputResourceId: input.outputResourceId,
          outputIndex: input.outputIndex,
        },
      }),
    onSuccess: (response, input) => {
      const updated = response.item.nodes.find((node) => node.id === input.nodeId)
      if (updated?.data.nodeType === 'image_generation' || updated?.data.nodeType === 'video_generation') {
        applyRemoteMediaView(input.nodeId, updated.data.mediaView, response.item.version)
      }
      queryClient.setQueryData(workflowKeys.detail(workflowId), response)
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(input.taskId) })
    },
  })

  const runNode = useCallback((nodeId: string) => runMutation.mutate(nodeId), [runMutation])

  const selectOutput = useCallback(
    (nodeId: string, taskId: string, outputResourceId: string, outputIndex: number) => {
      mediaViewMutation.mutate({ nodeId, taskId, outputResourceId, outputIndex })
    },
    [mediaViewMutation.mutate],
  )

  if (workflowQuery.isLoading || (webEnv.workflowCanvasSyncMode === 'primary' && collaborationSnapshotQuery.isLoading)) {
    return <div className="mina-wc-page"><div className="mina-wc-loading">Loading workflow</div></div>
  }

  if (
    workflowQuery.isError ||
    !workflowQuery.data ||
    (webEnv.workflowCanvasSyncMode === 'primary' && collaborationSnapshotQuery.isError)
  ) {
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
          {remoteUpdatePending ? (
            <RemoteUpdateBanner
              onRefresh={() => {
                void queryClient.invalidateQueries({ queryKey: workflowKeys.detail(workflowId) })
              }}
            />
          ) : null}
          <SaveStatusPill dirty={dirty} saving={saving} />
        </div>
      </header>

      <section className="mina-wc-stage" aria-label="Workflow canvas">
        <WorkflowCanvas
          onRunNode={runNode}
          onSelectOutput={selectOutput}
          runError={runError}
          runningNodeId={runningNodeId}
        />
        <CanvasToolbar dirty={dirty} onAddNode={addNode} onSave={saveNow} saving={saving} />
      </section>
    </div>
  )
}
