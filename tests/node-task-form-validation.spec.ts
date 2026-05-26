import {
  validateNodeTaskFormDraftValue,
  validateNodeTaskFormSubmitValue,
} from '../apps/web/src/features/workflow-canvas/forms/validation'

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message)
  }
}

const draftValue = {
  kind: 'image_generation' as const,
  provider: 'google',
  model: 'gemini-3.1-flash-image-preview',
  prompt: '',
  params: {
    aspectRatio: '1:1',
    count: 1,
    imageSize: '1K',
  },
}

assert(
  validateNodeTaskFormDraftValue({ value: draftValue }) === undefined,
  'draft autosave validation should allow an empty prompt',
)

const submitError = validateNodeTaskFormSubmitValue({ value: draftValue })

assert(
  submitError?.fields?.prompt === 'Prompt is required.',
  'submit validation should reject an empty prompt',
)

console.log('node task form validation checks passed')
