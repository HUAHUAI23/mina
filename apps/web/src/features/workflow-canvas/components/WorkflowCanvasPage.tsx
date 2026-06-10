import { useCallback, useEffect, useState } from 'react'
import '@xyflow/react/dist/style.css'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import type { TaskStatus } from '@mina/contracts/modules/tasks'
import type { WorkflowNodeRunStatus } from '@mina/contracts/modules/workflows'

import { useMessages } from '../../../app/i18n-provider'
import { taskKeys, workflowKeys } from '../api/workflow-keys'
import {
  createWorkflowRun,
  getWorkflow,
} from '../api/workflow-queries'
import { useCanvasStore } from '../store/canvas-store'
import { useNodeRuntimeStore } from '../store/node-runtime-store'
import { useWorkflowEventStream } from '../sync/use-workflow-event-stream'
import { useWorkflowYjsSync } from '../sync/yjs/yjs-sync'
import { SaveStatusPill } from './SaveStatusPill'
import { WorkflowCanvas } from './WorkflowCanvas'

interface WorkflowCanvasPageProps {
  workflowId: string
}

const nodeRunStatusToTaskStatus = (status: WorkflowNodeRunStatus): TaskStatus => {
  switch (status) {
    case 'running':
      return 'running'
    case 'succeeded':
      return 'succeeded'
    case 'failed':
      return 'failed'
    default:
      return 'queued'
  }
}

const pageShellClassName = 'relative h-dvh w-screen min-w-0 overflow-hidden bg-surface text-foreground'
const loadingShellClassName = 'grid h-dvh w-screen place-items-center overflow-hidden bg-surface text-foreground'
const loadingClassName = 'p-2.5 text-[0.74rem] font-bold text-foreground-quaternary'
const headerClassName = 'pointer-events-none absolute inset-x-0 top-0 z-30 flex min-w-0 items-start justify-between gap-3 bg-linear-to-b from-surface/80 via-surface/28 to-transparent px-[clamp(14px,2.6dvw,32px)] pt-3.5 pb-12'
const headerActionsClassName = 'pointer-events-auto flex min-w-0 flex-none items-center justify-end gap-3'
const backLinkClassName = 'mina-wc-floating-surface pointer-events-auto flex size-10 flex-none items-center justify-center rounded-full text-foreground-tertiary transition-colors duration-200 hover:bg-surface-container-high hover:text-foreground'
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
  useWorkflowYjsSync(workflowId)
  useWorkflowEventStream(workflowId)

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

  // Seed the ephemeral facts layer from the load-time runtime summary so a freshly opened canvas
  // can show each node's latest output before any live event arrives.
  const nodeRuntime = workflowQuery.data?.nodeRuntime
  useEffect(() => {
    if (nodeRuntime) {
      useNodeRuntimeStore.getState().mergeServerRuntime(nodeRuntime)
    }
  }, [nodeRuntime])

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
      // Immediately advance each node to its new task so previews follow the run before events land.
      const applyNodeTaskStatus = useNodeRuntimeStore.getState().applyNodeTaskStatus
      for (const [nodeId, state] of Object.entries(response.item.nodeStates)) {
        if (state.taskId) {
          const statusUpdatedAt = state.completedAt ?? state.startedAt ?? response.item.updatedAt
          applyNodeTaskStatus({
            nodeId,
            status: nodeRunStatusToTaskStatus(state.status),
            taskCreatedAt: response.item.createdAt,
            taskId: state.taskId,
            taskUpdatedAt: statusUpdatedAt,
          })
        }
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


  return (
    <div className={pageShellClassName}>
      <section className={stageClassName} aria-label={m.workflow_canvas_label()}>
        <WorkflowCanvas
          onRunNode={runNode}
          onSelectOutput={selectOutput}
          runError={runError}
          runningNodeId={runningNodeId}
          workflowId={workflowId}
        />
      </section>

      <header className={headerClassName}>
        <Link aria-label={m.workflow_canvas_back_to_list()} className={backLinkClassName} to="/projects">
          <ArrowLeft aria-hidden="true" size={17} />
        </Link>
        <div className={headerActionsClassName}>
          <SaveStatusPill yjsConnectionStatus={yjsConnectionStatus} />
        </div>
      </header>
    </div>
  )
}
