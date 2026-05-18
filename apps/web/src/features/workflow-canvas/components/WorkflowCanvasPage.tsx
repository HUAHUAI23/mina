import { useCallback, useEffect, useState } from 'react'
import '@xyflow/react/dist/style.css'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { taskKeys, workflowKeys } from '../api/workflow-keys'
import { createWorkflowRun, getWorkflow, patchNodeMediaView, saveWorkflow } from '../api/workflow-queries'
import { getWorkflowClientId, parseWorkflowEvent, workflowEventUrl } from '../api/workflow-ws'
import { getCanvasSnapshot, useCanvasStore } from '../store/canvas-store'
import { sortParentNodesFirst, stableEdges } from '../utils/react-flow-persistence'
import { BottomNodeDock } from './panels/BottomNodeDock'
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
  const workflowQuery = useQuery({
    queryFn: () => getWorkflow(workflowId),
    queryKey: workflowKeys.detail(workflowId),
  })
  const nodes = useCanvasStore((state) => state.nodes)
  const dirty = useCanvasStore((state) => state.dirty)
  const saving = useCanvasStore((state) => state.saving)
  const version = useCanvasStore((state) => state.version)
  const remoteUpdatePending = useCanvasStore((state) => state.remoteUpdatePending)
  const remoteVersion = useCanvasStore((state) => state.remoteVersion)
  const addNode = useCanvasStore((state) => state.addNode)
  const initialize = useCanvasStore((state) => state.initialize)
  const markClean = useCanvasStore((state) => state.markClean)
  const selectedNodeIds = useCanvasStore((state) => state.selectedNodeIds)
  const setRemoteUpdate = useCanvasStore((state) => state.setRemoteUpdate)
  const applyRemoteMediaView = useCanvasStore((state) => state.applyRemoteMediaView)
  const setSaving = useCanvasStore((state) => state.setSaving)
  const selectedNode = nodes.find((node) => node.id === selectedNodeIds[0])

  useEffect(() => {
    if (workflowQuery.data && !dirty) {
      initialize({
        workflowId: workflowQuery.data.item.id,
        version: workflowQuery.data.item.version,
        name: workflowQuery.data.item.name,
        nodes: workflowQuery.data.item.nodes,
        edges: workflowQuery.data.item.edges,
      })
    }
  }, [dirty, initialize, workflowQuery.data])

  useEffect(() => {
    const clientId = getWorkflowClientId()
    const socket = new WebSocket(workflowEventUrl(workflowId))
    socket.onmessage = (message) => {
      if (typeof message.data !== 'string') {
        return
      }
      const event = parseWorkflowEvent(message.data)
      if (!event || event.workflowId !== workflowId || event.sourceClientId === clientId) {
        return
      }
      if (dirty) {
        setRemoteUpdate(event.version ?? version)
        return
      }
      if (event.type === 'workflow.node.mediaView.updated') {
        applyRemoteMediaView(event.payload.nodeId, event.payload.mediaView, event.version ?? version)
      }
      void queryClient.invalidateQueries({ queryKey: workflowKeys.detail(workflowId) })
      if (event.type === 'workflow.node.task.updated' && selectedNodeIds[0] === event.payload.nodeId) {
        void queryClient.invalidateQueries({ queryKey: workflowKeys.nodeTasks(workflowId, event.payload.nodeId) })
      }
      if (event.type === 'workflow.run.updated') {
        void queryClient.invalidateQueries({ queryKey: workflowKeys.runs(workflowId) })
      }
    }
    return () => socket.close()
  }, [applyRemoteMediaView, dirty, queryClient, selectedNodeIds, setRemoteUpdate, version, workflowId])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const snapshot = getCanvasSnapshot()
      const response = await saveWorkflow(workflowId, {
        name: snapshot.name || workflowQuery.data?.item.name,
        version: snapshot.version,
        nodes: sortParentNodesFirst(snapshot.nodes),
        edges: stableEdges(snapshot.edges),
      })
      return response
    },
    onMutate: () => setSaving(true),
    onSettled: () => setSaving(false),
    onSuccess: (response) => {
      markClean({
        name: response.item.name,
        version: response.item.version,
        nodes: response.item.nodes,
        edges: response.item.edges,
      })
      queryClient.setQueryData(workflowKeys.detail(workflowId), response)
    },
    onError: (error) => setRunError(error instanceof Error ? error.message : 'Save failed.'),
  })

  const runMutation = useMutation({
    mutationFn: async (nodeId: string) => {
      let currentVersion = getCanvasSnapshot().version
      if (getCanvasSnapshot().dirty) {
        const saved = await saveMutation.mutateAsync()
        currentVersion = saved.item.version
      }
      return createWorkflowRun(workflowId, { selectedNodeId: nodeId, expectedWorkflowVersion: currentVersion })
    },
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

  const runSelected = useCallback(() => {
    if (selectedNode) {
      runMutation.mutate(selectedNode.id)
    }
  }, [runMutation, selectedNode])

  const selectOutput = useCallback(
    (nodeId: string, taskId: string, outputResourceId: string, outputIndex: number) => {
      mediaViewMutation.mutate({ nodeId, taskId, outputResourceId, outputIndex })
    },
    [mediaViewMutation.mutate],
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
          {remoteUpdatePending ? (
            <RemoteUpdateBanner
              version={remoteVersion}
              onRefresh={() => {
                void queryClient.invalidateQueries({ queryKey: workflowKeys.detail(workflowId) })
              }}
            />
          ) : null}
          <SaveStatusPill dirty={dirty} saving={saving} />
        </div>
      </header>

      <section className="mina-wc-stage" aria-label="Workflow canvas">
        <WorkflowCanvas onSelectOutput={selectOutput} />
        <CanvasToolbar dirty={dirty} onAddNode={addNode} onSave={() => saveMutation.mutate()} saving={saving} />
        <BottomNodeDock
          node={selectedNode}
          nodes={nodes}
          onRun={runSelected}
          runError={runError}
          running={runMutation.isPending}
          workflowId={workflowId}
        />
      </section>
    </div>
  )
}
