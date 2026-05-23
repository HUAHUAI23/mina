import { ChevronDown, ImagePlus, Maximize2, SendHorizontal, Sparkles } from 'lucide-react'
import { useRef, useState } from 'react'
import { cn } from '@mina/ui/lib/utils'

import { useCanvasStore } from '../../store/canvas-store'
import { useCanvasUiStore } from '../../store/canvas-ui-store'
import { defaultTaskForNodeType, isMediaGenerationNode, type MediaGenerationCanvasNode } from '../../domain/canvas-node-types'
import { defaultFormValueForKind, formValueForSpec } from '../../forms/model-compatibility'
import { formValueToTask } from '../../forms/model-form-utils'
import { listClientModels, modelSelectValue } from '../../forms/registry/client-model-registry'
import '../../forms/registry'
import { useMediaTaskForm } from '../media-task-form'
import type { ComposerRuntime, ComposerSurface } from '../types'

interface PromptBlockProps {
  node?: MediaGenerationCanvasNode | undefined
  runtime: ComposerRuntime
  surface: Exclude<ComposerSurface, 'hidden'>
}

const promptShellClassName = 'mina-wc-prompt-shell relative min-w-0'
const promptSectionClassName = 'mina-wc-prompt-section relative min-w-0'
const expandButtonClassName = 'mina-wc-expand-button absolute top-0.5 right-0.5 z-2 flex size-9 items-center justify-center rounded-full border-0 bg-transparent text-foreground-quaternary hover:bg-surface-container-low hover:text-foreground'
const emptyPromptTriggerClassName = 'mina-wc-empty-prompt-trigger flex min-h-10.5 min-w-0 items-center justify-start gap-2.5 rounded-[18px] border-0 bg-transparent px-3 text-left text-[0.98rem] font-semibold text-foreground-quaternary hover:bg-surface-container-low hover:text-foreground focus-visible:bg-surface-container-low focus-visible:text-foreground'
const emptyPromptTriggerLabelClassName = 'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap'
const emptyPromptTextareaClassName = 'max-h-[90px] min-h-10.5 resize-none border-0 bg-transparent pt-[11px] pr-2 pb-[9px] pl-3.5 text-[0.98rem] leading-[1.3] text-foreground outline-0 placeholder:text-foreground-quaternary'
const emptyModelSelectClassName = 'mina-wc-empty-model-select inline-flex min-w-0 items-center gap-[7px] text-foreground-tertiary max-[720px]:hidden'
const emptyModelControlClassName = 'min-h-[38px] min-w-0 max-w-[190px] appearance-none border-0 bg-transparent text-[0.86rem] font-bold text-foreground outline-0'
const emptyRunButtonClassName = 'flex size-10.5 items-center justify-center rounded-full border-0 bg-foreground text-primary-foreground disabled:bg-surface-container-high disabled:text-foreground-quaternary'
const emptyErrorClassName = 'col-span-full m-0 text-[0.72rem] text-destructive'
const emptyPromptBarClassName = 'mina-wc-empty-prompt-bar grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2.5 max-[720px]:grid-cols-[minmax(0,1fr)_auto]'

export function PromptBlock({ node, runtime, surface }: PromptBlockProps) {
  if (!node) {
    return <EmptyPromptBar runtime={runtime} surface={surface} />
  }
  return <NodePromptEditor node={node} />
}

function NodePromptEditor({ node }: { node: MediaGenerationCanvasNode }) {
  const { form } = useMediaTaskForm()

  return (
    <div className={promptShellClassName}>
      <button className={expandButtonClassName} type="button" title="Expand composer" aria-label="Expand composer">
        <Maximize2 aria-hidden="true" size={18} />
      </button>
      <section className={promptSectionClassName} aria-label="Prompt">
        <form.AppField name="prompt">
          {(field) => (
            <field.TextField
              multiline
              placeholder={node.data.nodeType === 'video_generation' ? 'Describe the motion' : 'Describe the image'}
            />
          )}
        </form.AppField>
      </section>
    </div>
  )
}

function EmptyPromptBar({ runtime, surface }: { runtime: ComposerRuntime; surface: Exclude<ComposerSurface, 'hidden'> }) {
  const addNode = useCanvasStore((state) => state.addNode)
  const openNodePanel = useCanvasUiStore((state) => state.openNodePanel)
  const availableModels = listClientModels('image_generation', 'text')
  const fallbackFormValue = defaultFormValueForKind('image_generation', {})
  const [selectedModelValue, setSelectedModelValue] = useState(() => {
    const [firstModel] = availableModels
    return firstModel ? modelSelectValue(firstModel.key) : modelSelectValue(fallbackFormValue)
  })
  const [prompt, setPrompt] = useState('')
  const [expanded, setExpanded] = useState(surface === 'expanded')
  const promptRef = useRef<HTMLTextAreaElement | null>(null)
  const canSubmit = Boolean(prompt.trim())
  const running = Boolean(runtime.runningNodeId)

  const expandPrompt = () => {
    setExpanded(true)
    window.requestAnimationFrame(() => promptRef.current?.focus())
  }

  const createAndRun = () => {
    const trimmed = prompt.trim()
    if (!trimmed) {
      expandPrompt()
      return
    }
    const selectedModel = availableModels.find((model) => modelSelectValue(model.key) === selectedModelValue)
    const formValue = selectedModel ? formValueForSpec(selectedModel) : fallbackFormValue
    const nodeId = addNode('image_generation', formValueToTask({ ...formValue, prompt: trimmed }))
    openNodePanel(nodeId, 'config')
    runtime.onRunNode(nodeId)
    setPrompt('')
    setExpanded(false)
  }

  const collapsedPlaceholder = defaultTaskForNodeType('image_generation').prompt

  return (
    <form
      className={cn(
        emptyPromptBarClassName,
        expanded
          ? 'min-h-44 items-end'
          : 'min-h-[58px] items-center max-[720px]:min-h-[50px]',
      )}
      data-expanded={expanded ? 'true' : undefined}
      data-surface={surface}
      onSubmit={(event) => {
        event.preventDefault()
        createAndRun()
      }}
    >
      {expanded ? (
        <textarea
          aria-label="Prompt"
          className={cn(emptyPromptTextareaClassName, expanded && 'min-h-28 self-start pt-4.5')}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={collapsedPlaceholder}
          ref={promptRef}
          value={prompt}
        />
      ) : (
        <button
          aria-label="Open prompt composer"
          className={emptyPromptTriggerClassName}
          onClick={expandPrompt}
          type="button"
        >
        <ImagePlus aria-hidden="true" size={17} />
        <span className={emptyPromptTriggerLabelClassName}>{collapsedPlaceholder}</span>
      </button>
      )}
      <label className={emptyModelSelectClassName}>
        <Sparkles aria-hidden="true" size={16} />
        <select
          aria-label="Model"
          className={emptyModelControlClassName}
          onChange={(event) => setSelectedModelValue(event.target.value)}
          value={selectedModelValue}
        >
          {availableModels.length ? (
            availableModels.map((model) => (
              <option key={modelSelectValue(model.key)} value={modelSelectValue(model.key)}>
                {model.displayName}
              </option>
            ))
          ) : (
            <option value={selectedModelValue}>Default image model</option>
          )}
        </select>
        <ChevronDown aria-hidden="true" size={14} />
      </label>
      {runtime.runError ? <p className={emptyErrorClassName}>{runtime.runError}</p> : null}
      <button
        aria-label="Run prompt"
        className={emptyRunButtonClassName}
        disabled={(expanded && !canSubmit) || running}
        title="Run prompt"
        type="submit"
      >
        <SendHorizontal aria-hidden="true" size={18} />
      </button>
    </form>
  )
}

export const promptBlockMatchesNode = (node: unknown): node is MediaGenerationCanvasNode =>
  isMediaGenerationNode(node as MediaGenerationCanvasNode | undefined)
