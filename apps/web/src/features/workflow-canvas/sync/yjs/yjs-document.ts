import * as Y from 'yjs'
import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import type { NodeMediaSlots } from '@mina/contracts/modules/media'
import type { TaskDraftConfig } from '@mina/contracts/modules/tasks'

export interface WorkflowYDocHandles {
  edgeOrder: Y.Array<string>
  edges: Y.Map<unknown>
  meta: Y.Map<unknown>
  nodeFrames: Y.Map<unknown>
  nodeOrder: Y.Array<string>
  nodes: Y.Map<unknown>
  ydoc: Y.Doc
}

export interface WorkflowYSnapshot {
  edges: WorkflowCanvasEdge[]
  nodes: WorkflowCanvasNode[]
}

export const workflowYjsSnapshotSignature = (snapshot: WorkflowYSnapshot): string =>
  JSON.stringify({
    edges: snapshot.edges.map((edge) => ({
      data: edge.data,
      id: edge.id,
      source: edge.source,
      sourceHandle: edge.sourceHandle,
      target: edge.target,
      targetHandle: edge.targetHandle,
      type: edge.type ?? 'media',
    })),
    nodes: snapshot.nodes.map((node) => ({
      data: node.data,
      extent: node.extent,
      height: node.height,
      id: node.id,
      parentId: node.parentId,
      position: node.position,
      type: node.type,
      width: node.width,
    })),
  })

export const createWorkflowYDoc = (): WorkflowYDocHandles => {
  const ydoc = new Y.Doc()
  return {
    edgeOrder: ydoc.getArray<string>('edgeOrder'),
    edges: ydoc.getMap<unknown>('edges'),
    meta: ydoc.getMap<unknown>('meta'),
    nodeFrames: ydoc.getMap<unknown>('nodeFrames'),
    nodeOrder: ydoc.getArray<string>('nodeOrder'),
    nodes: ydoc.getMap<unknown>('nodes'),
    ydoc,
  }
}

const replaceYArray = <TValue>(array: Y.Array<TValue>, values: readonly TValue[]): void => {
  if (array.length > 0) {
    array.delete(0, array.length)
  }
  if (values.length > 0) {
    array.insert(0, [...values])
  }
}

const unique = <TValue>(values: readonly TValue[]): TValue[] => Array.from(new Set(values))

type WorkflowYNodeFrame = Pick<WorkflowCanvasNode, 'position'> &
  Partial<Pick<WorkflowCanvasNode, 'extent' | 'height' | 'parentId' | 'width'>>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !(value instanceof Y.Map) && !(value instanceof Y.Array) && !(value instanceof Y.Text)

const cloneJson = <TValue>(value: TValue): TValue => structuredClone(value)

const ensureYMap = (map: Y.Map<unknown>, key: string): { created: boolean; yMap: Y.Map<unknown> } => {
  const current = map.get(key)
  if (current instanceof Y.Map) {
    return { created: false, yMap: current }
  }
  const next = new Y.Map<unknown>()
  map.set(key, next)
  return { created: true, yMap: next }
}

const replaceYText = (text: Y.Text, value: string): void => {
  if (text.toString() === value) {
    return
  }
  if (text.length > 0) {
    text.delete(0, text.length)
  }
  if (value.length > 0) {
    text.insert(0, value)
  }
}

const setYText = (map: Y.Map<unknown>, key: string, value: string): void => {
  const current = map.get(key)
  if (current instanceof Y.Text) {
    replaceYText(current, value)
    return
  }
  const text = new Y.Text()
  map.set(key, text)
  if (value.length > 0) {
    text.insert(0, value)
  }
}

const yTextValue = (value: unknown): string | undefined => {
  if (value instanceof Y.Text) {
    return value.toString()
  }
  return typeof value === 'string' ? value : undefined
}

const nodeFrameFromNode = (node: WorkflowCanvasNode): WorkflowYNodeFrame => ({
  position: node.position,
  ...(node.parentId ? { parentId: node.parentId } : {}),
  ...(node.extent ? { extent: node.extent } : {}),
  ...(node.width !== undefined ? { width: node.width } : {}),
  ...(node.height !== undefined ? { height: node.height } : {}),
})

const applyNodeFrame = (node: WorkflowCanvasNode, frame: unknown): WorkflowCanvasNode => {
  if (!frame || typeof frame !== 'object' || !('position' in frame)) {
    return node
  }
  const typedFrame = frame as WorkflowYNodeFrame
  return {
    ...node,
    position: typedFrame.position,
    ...(typedFrame.parentId ? { parentId: typedFrame.parentId } : {}),
    ...(typedFrame.extent ? { extent: typedFrame.extent } : {}),
    ...(typedFrame.width !== undefined ? { width: typedFrame.width } : {}),
    ...(typedFrame.height !== undefined ? { height: typedFrame.height } : {}),
  }
}

const writeNodeFrameToYMap = (map: Y.Map<unknown>, node: WorkflowCanvasNode): void => {
  const frame = nodeFrameFromNode(node)
  map.set('position', cloneJson(frame.position))
  if (frame.parentId) {
    map.set('parentId', frame.parentId)
  } else {
    map.delete('parentId')
  }
  if (frame.extent) {
    map.set('extent', frame.extent)
  } else {
    map.delete('extent')
  }
  if (frame.width !== undefined) {
    map.set('width', frame.width)
  } else {
    map.delete('width')
  }
  if (frame.height !== undefined) {
    map.set('height', frame.height)
  } else {
    map.delete('height')
  }
}

const nodeFrameFromYMap = (map: Y.Map<unknown>): WorkflowYNodeFrame | undefined => {
  const position = map.get('position')
  if (!isRecord(position) || typeof position.x !== 'number' || typeof position.y !== 'number') {
    return undefined
  }
  const parentId = map.get('parentId')
  const extent = map.get('extent')
  const width = map.get('width')
  const height = map.get('height')
  return {
    position: cloneJson(position) as WorkflowYNodeFrame['position'],
    ...(typeof parentId === 'string' ? { parentId } : {}),
    ...(extent === 'parent' ? { extent } : {}),
    ...(typeof width === 'number' ? { width } : {}),
    ...(typeof height === 'number' ? { height } : {}),
  }
}

const writeTaskToYMap = (
  map: Y.Map<unknown>,
  task: TaskDraftConfig | undefined,
): void => {
  if (!task) {
    return
  }
  map.set('kind', task.kind)
  map.set('provider', task.provider)
  map.set('model', task.model)
  setYText(map, 'prompt', task.prompt)
  map.set('params', cloneJson(task.params))
}

const taskFromYValue = (
  value: unknown,
): TaskDraftConfig | undefined => {
  if (value instanceof Y.Map) {
    const kind = value.get('kind')
    const provider = value.get('provider')
    const model = value.get('model')
    const prompt = yTextValue(value.get('prompt'))
    const params = value.get('params')
    if (
      (kind === 'image_generation' || kind === 'video_generation') &&
      typeof provider === 'string' &&
      typeof model === 'string' &&
      typeof prompt === 'string'
    ) {
      return {
        kind,
        provider,
        model,
        prompt,
        params: isRecord(params) ? cloneJson(params) : {},
      }
    }
    return undefined
  }
  return isRecord(value) ? cloneJson(value) as TaskDraftConfig : undefined
}

const writeConfigToYMap = (
  map: Y.Map<unknown>,
  data: WorkflowCanvasNode['data'],
): void => {
  if (data.nodeType === 'image_generation' || data.nodeType === 'video_generation') {
    map.delete('text')
    map.delete('note')
    if (data.config.task) {
      const { yMap: taskMap } = ensureYMap(map, 'task')
      writeTaskToYMap(taskMap, data.config.task)
    } else {
      map.delete('task')
    }
    return
  }
  map.delete('task')
  if (data.nodeType === 'text') {
    map.delete('note')
    setYText(map, 'text', data.config.text)
    return
  }
  map.delete('text')
  if (data.config.note !== undefined) {
    map.set('note', data.config.note)
  } else {
    map.delete('note')
  }
}

const configFromYValue = (
  value: unknown,
  nodeType: WorkflowCanvasNode['data']['nodeType'],
): WorkflowCanvasNode['data']['config'] => {
  if (!(value instanceof Y.Map)) {
    if (isRecord(value)) {
      return cloneJson(value) as WorkflowCanvasNode['data']['config']
    }
    return nodeType === 'text' ? { text: '' } : {}
  }
  if (nodeType === 'image_generation' || nodeType === 'video_generation') {
    const task = taskFromYValue(value.get('task'))
    return task ? { task } : {}
  }
  if (nodeType === 'text') {
    return { text: yTextValue(value.get('text')) ?? '' }
  }
  const note = value.get('note')
  return typeof note === 'string' ? { note } : {}
}

const writeMediaSlotsToYMap = (map: Y.Map<unknown>, slots: NodeMediaSlots | undefined): void => {
  const nextSlots = slots && typeof slots === 'object' ? slots as Record<string, unknown> : {}
  for (const key of Array.from(map.keys())) {
    if (!(key in nextSlots)) {
      map.delete(key)
    }
  }
  for (const [slot, items] of Object.entries(nextSlots)) {
    if (!Array.isArray(items)) {
      continue
    }
    const current = map.get(slot)
    let array: Y.Array<unknown>
    if (current instanceof Y.Array) {
      array = current
    } else {
      array = new Y.Array<unknown>()
      map.set(slot, array)
    }
    replaceYArray(array, items.map((item) => cloneJson(item)))
  }
}

const mediaSlotsFromYValue = (value: unknown): NodeMediaSlots => {
  if (value instanceof Y.Map) {
    const slots: NodeMediaSlots = {}
    for (const [slot, items] of value.entries()) {
      if (items instanceof Y.Array) {
        slots[slot as keyof typeof slots] = items.toArray().map((item) => cloneJson(item)) as never
      } else if (Array.isArray(items)) {
        slots[slot as keyof typeof slots] = items.map((item) => cloneJson(item)) as never
      }
    }
    return slots
  }
  return isRecord(value) ? cloneJson(value) as NodeMediaSlots : {}
}

const writeNodeDataToYMap = (map: Y.Map<unknown>, data: WorkflowCanvasNode['data']): void => {
  map.set('nodeType', data.nodeType)
  map.set('title', data.title)

  const { yMap: config } = ensureYMap(map, 'config')
  writeConfigToYMap(config, data)

  if (data.nodeType === 'image_generation' || data.nodeType === 'video_generation') {
    if (data.mediaView) {
      map.set('mediaView', cloneJson(data.mediaView))
    } else {
      map.delete('mediaView')
    }
    const { yMap: mediaSlots } = ensureYMap(map, 'mediaSlots')
    writeMediaSlotsToYMap(mediaSlots, data.mediaSlots ?? {})
    return
  }

  map.delete('mediaView')
  map.delete('mediaSlots')
}

const nodeDataFromYValue = (value: unknown): WorkflowCanvasNode['data'] | undefined => {
  if (!(value instanceof Y.Map)) {
    return isRecord(value) ? cloneJson(value) as WorkflowCanvasNode['data'] : undefined
  }
  const nodeType = value.get('nodeType')
  const title = value.get('title')
  if (typeof title !== 'string') {
    return undefined
  }
  if (nodeType === 'image_generation' || nodeType === 'video_generation') {
    const mediaView = value.get('mediaView')
    return {
      nodeType,
      title,
      config: configFromYValue(value.get('config'), nodeType) as Extract<WorkflowCanvasNode['data'], { nodeType: typeof nodeType }>['config'],
      ...(isRecord(mediaView) ? { mediaView: cloneJson(mediaView) } : {}),
      mediaSlots: mediaSlotsFromYValue(value.get('mediaSlots')),
    } as WorkflowCanvasNode['data']
  }
  if (nodeType === 'text' || nodeType === 'flow_group' || nodeType === 'node_group') {
    return {
      nodeType,
      title,
      config: configFromYValue(value.get('config'), nodeType),
    } as WorkflowCanvasNode['data']
  }
  return undefined
}

export const writeWorkflowNode = (
  nodes: Y.Map<unknown>,
  node: WorkflowCanvasNode,
): void => {
  const { yMap: nodeMap } = ensureYMap(nodes, node.id)
  nodeMap.set('id', node.id)
  nodeMap.set('type', node.type)
  writeNodeFrameToYMap(nodeMap, node)
  writeNodeDataToYMap(ensureYMap(nodeMap, 'data').yMap, node.data)
}

export const writeWorkflowTextNodeText = (
  nodes: Y.Map<unknown>,
  nodeId: string,
  text: string,
): boolean => {
  const nodeMap = nodes.get(nodeId)
  if (!(nodeMap instanceof Y.Map)) {
    return false
  }
  const dataMap = nodeMap.get('data')
  if (!(dataMap instanceof Y.Map) || dataMap.get('nodeType') !== 'text') {
    return false
  }
  const { yMap: configMap } = ensureYMap(dataMap, 'config')
  setYText(configMap, 'text', text)
  return true
}

export const writeWorkflowNodeTaskPrompt = (
  nodes: Y.Map<unknown>,
  nodeId: string,
  prompt: string,
): boolean => {
  const nodeMap = nodes.get(nodeId)
  if (!(nodeMap instanceof Y.Map)) {
    return false
  }
  const dataMap = nodeMap.get('data')
  const nodeType = dataMap instanceof Y.Map ? dataMap.get('nodeType') : undefined
  if (!(dataMap instanceof Y.Map) || (nodeType !== 'image_generation' && nodeType !== 'video_generation')) {
    return false
  }
  const configMap = dataMap.get('config')
  const taskMap = configMap instanceof Y.Map ? configMap.get('task') : undefined
  if (!(taskMap instanceof Y.Map)) {
    return false
  }
  setYText(taskMap, 'prompt', prompt)
  return true
}

const corruptNodeMessage = (id: unknown, type: unknown, data: WorkflowCanvasNode['data'] | undefined): string =>
  `Corrupt workflow node in Y.Doc: id=${String(id)} type=${String(type)} data=${data ? 'ok' : 'invalid'}`

export const readWorkflowNodeFromYjs = (value: unknown): WorkflowCanvasNode | undefined => {
  if (!(value instanceof Y.Map)) {
    return isRecord(value) ? cloneJson(value) as WorkflowCanvasNode : undefined
  }
  const id = value.get('id')
  const type = value.get('type')
  const data = nodeDataFromYValue(value.get('data'))
  if (typeof id !== 'string' || typeof type !== 'string' || !data) {
    const message = corruptNodeMessage(id, type, data)
    if (!import.meta.env.PROD) {
      throw new Error(message)
    }
    console.error(message)
    return undefined
  }
  return applyNodeFrame(
    {
      id,
      type: type as WorkflowCanvasNode['type'],
      position: { x: 0, y: 0 },
      data,
    },
    nodeFrameFromYMap(value),
  )
}

export const importWorkflowSnapshotToYjs = (
  y: WorkflowYDocHandles,
  snapshot: WorkflowYSnapshot,
  origin = 'mina-import',
): void => {
  y.ydoc.transact(() => {
    y.nodes.clear()
    y.nodeFrames.clear()
    for (const node of snapshot.nodes) {
      writeWorkflowNode(y.nodes, node)
      y.nodeFrames.set(node.id, nodeFrameFromNode(node))
    }
    replaceYArray(y.nodeOrder, unique(snapshot.nodes.map((node) => node.id)))

    y.edges.clear()
    for (const edge of snapshot.edges) {
      y.edges.set(edge.id, edge)
    }
    replaceYArray(y.edgeOrder, unique(snapshot.edges.map((edge) => edge.id)))
  }, origin)
}

const orderedValues = <TValue>(
  order: Y.Array<string>,
  values: Y.Map<unknown>,
): TValue[] => {
  const seen = new Set<string>()
  const ordered = unique(order.toArray())
    .flatMap((id) => {
      const value = values.get(id)
      if (!value) {
        return []
      }
      seen.add(id)
      return [value as TValue]
    })
  const missingFromOrder = Array.from(values.entries())
    .filter(([id, value]) => !seen.has(id) && Boolean(value))
    .map(([, value]) => value as TValue)
  return [...ordered, ...missingFromOrder]
}

const orderedNodes = (
  order: Y.Array<string>,
  values: Y.Map<unknown>,
): WorkflowCanvasNode[] => {
  const seen = new Set<string>()
  const ordered = unique(order.toArray())
    .flatMap((id) => {
      const node = readWorkflowNodeFromYjs(values.get(id))
      if (!node) {
        return []
      }
      seen.add(id)
      return [node]
    })
  const missingFromOrder = Array.from(values.entries())
    .filter(([id]) => !seen.has(id))
    .flatMap(([, value]) => {
      const node = readWorkflowNodeFromYjs(value)
      return node ? [node] : []
    })
  return [...ordered, ...missingFromOrder]
}

export const exportWorkflowSnapshotFromYjs = (y: WorkflowYDocHandles): WorkflowYSnapshot => {
  const nodes = orderedNodes(y.nodeOrder, y.nodes)
    .map((node) => applyNodeFrame(node, y.nodeFrames.get(node.id)))
  const edges = orderedValues<WorkflowCanvasEdge>(y.edgeOrder, y.edges)
  return { edges, nodes }
}

export const workflowYjsSnapshotMatches = (
  left: WorkflowYSnapshot,
  right: WorkflowYSnapshot,
): boolean =>
  workflowYjsSnapshotSignature(left) === workflowYjsSnapshotSignature(right)
