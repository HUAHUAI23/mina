import { Camera, Image as ImageIcon, Sparkles } from 'lucide-react'
import {
  GOOGLE_IMAGE_ASPECT_RATIOS,
  GOOGLE_IMAGE_PRO_ASPECT_RATIOS,
  GOOGLE_IMAGE_PRO_SIZES,
  GOOGLE_IMAGE_SIZES,
  GoogleGeminiImageParamsSchema,
  VOLCENGINE_SEEDREAM_4_5_SIZES,
  VOLCENGINE_SEEDREAM_5_SIZES,
  VolcengineSeedreamParamsSchema,
  type GoogleGeminiImageParams,
  type VolcengineSeedreamParams,
} from '@mina/contracts/modules/tasks/image-model-params'

import { useMessages } from '../../../../app/i18n-provider'
import type { ClientModelSpec } from './client-model-registry'
import { withNodeTaskFieldGroup } from '../form-context'

const option = (value: string) => ({ label: value, value })

const googleAspectRatioOptions = GOOGLE_IMAGE_ASPECT_RATIOS.map(option)
const googleProAspectRatioOptions = GOOGLE_IMAGE_PRO_ASPECT_RATIOS.map(option)
const googleSizeOptions = GOOGLE_IMAGE_SIZES.map(option)
const googleProSizeOptions = GOOGLE_IMAGE_PRO_SIZES.map(option)
const seedream5SizeOptions = VOLCENGINE_SEEDREAM_5_SIZES.map(option)
const seedream45SizeOptions = VOLCENGINE_SEEDREAM_4_5_SIZES.map(option)

type SelectOption = { label: string; value: string }

const GeminiBasicFields = withNodeTaskFieldGroup<Partial<GoogleGeminiImageParams>, unknown, {
  aspectRatioOptions?: SelectOption[]
  imageSizeOptions?: SelectOption[]
}>({
  defaultValues: {},
  render: ({
    group,
    imageSizeOptions = googleSizeOptions,
    aspectRatioOptions = googleAspectRatioOptions,
  }) => {
    const m = useMessages()
    return (
      <>
        <group.AppField name="aspectRatio">
          {(field) => <field.SelectField ariaLabel={m.workflow_canvas_aspect_ratio()} icon={ImageIcon} options={aspectRatioOptions} />}
        </group.AppField>
        <group.AppField name="imageSize">
          {(field) => <field.SelectField ariaLabel={m.workflow_canvas_image_size()} icon={Camera} options={imageSizeOptions} />}
        </group.AppField>
        <group.AppField name="count">
          {(field) => <field.NumberField ariaLabel={m.workflow_canvas_count()} icon={Sparkles} max={16} min={1} step={1} />}
        </group.AppField>
      </>
    )
  },
})

const GeminiAdvancedFields = withNodeTaskFieldGroup<Partial<GoogleGeminiImageParams>, unknown>({
  defaultValues: {},
  render: ({ group }) => {
    const m = useMessages()
    return (
      <>
        <group.AppField name="imageSearch">
          {(field) => <field.SwitchField label={m.workflow_canvas_image_search_grounding()} />}
        </group.AppField>
        <group.AppField name="webSearch">
          {(field) => <field.SwitchField label={m.workflow_canvas_web_search_grounding()} />}
        </group.AppField>
        <group.AppField name="includeThoughts">
          {(field) => <field.SwitchField label={m.workflow_canvas_include_thoughts()} />}
        </group.AppField>
        <group.AppField name="thinkingLevel">
          {(field) => (
            <field.SelectField
              label={m.workflow_canvas_thinking_level()}
              options={[
                { label: m.workflow_canvas_option_default(), value: '' },
                { label: m.workflow_canvas_option_minimal(), value: 'minimal' },
                { label: m.workflow_canvas_option_high(), value: 'high' },
              ]}
            />
          )}
        </group.AppField>
      </>
    )
  },
})

const GeminiProAdvancedFields = withNodeTaskFieldGroup<Partial<GoogleGeminiImageParams>, unknown>({
  defaultValues: {},
  render: ({ group }) => {
    const m = useMessages()
    return (
      <>
        <group.AppField name="webSearch">
          {(field) => <field.SwitchField label={m.workflow_canvas_web_search_grounding()} />}
        </group.AppField>
      </>
    )
  },
})

const SeedreamBasicFields = withNodeTaskFieldGroup<Partial<VolcengineSeedreamParams>, unknown, {
  sizeOptions: SelectOption[]
}>({
  defaultValues: {},
  render: ({ group, sizeOptions }) => {
    const m = useMessages()
    return (
      <>
        <group.AppField name="size">
          {(field) => <field.SelectField ariaLabel={m.workflow_canvas_image_size()} icon={ImageIcon} options={sizeOptions} />}
        </group.AppField>
        <group.AppField name="count">
          {(field) => <field.NumberField ariaLabel={m.workflow_canvas_count()} icon={Sparkles} max={16} min={1} step={1} />}
        </group.AppField>
      </>
    )
  },
})

const SeedreamAdvancedFields = withNodeTaskFieldGroup<Partial<VolcengineSeedreamParams>, unknown, {
  supportsPng: boolean
  supportsWebSearch: boolean
}>({
  defaultValues: {},
  render: ({ group, supportsPng, supportsWebSearch }) => {
    const m = useMessages()
    return (
      <>
        <group.AppField name="optimizePrompt">
          {(field) => <field.SwitchField label={m.workflow_canvas_optimize_prompt()} />}
        </group.AppField>
        <group.AppField name="outputFormat">
          {(field) => (
            <field.SelectField
              label={m.workflow_canvas_output_format()}
              options={[
                { label: m.workflow_canvas_option_default(), value: '' },
                ...(supportsPng ? [{ label: 'PNG', value: 'png' }] : []),
                { label: 'JPEG', value: 'jpeg' },
              ]}
            />
          )}
        </group.AppField>
        <group.AppField name="sequentialImageGeneration">
          {(field) => (
            <field.SelectField
              label={m.workflow_canvas_sequential_generation()}
              options={[
                { label: m.workflow_canvas_option_default(), value: '' },
                { label: m.workflow_canvas_option_auto(), value: 'auto' },
                { label: m.workflow_canvas_option_disabled(), value: 'disabled' },
              ]}
            />
          )}
        </group.AppField>
        <group.AppField name="maxImages">
          {(field) => <field.NumberField label={m.workflow_canvas_max_images()} max={16} min={1} step={1} />}
        </group.AppField>
        <group.AppField name="watermark">
          {(field) => <field.SwitchField label={m.workflow_canvas_watermark()} />}
        </group.AppField>
        {supportsWebSearch ? (
          <group.AppField name="webSearch">
            {(field) => <field.SwitchField label={m.workflow_canvas_web_search()} />}
          </group.AppField>
        ) : null}
      </>
    )
  },
})

export const imageClientModelSpecs: ClientModelSpec[] = [
  {
    AdvancedFields: GeminiAdvancedFields,
    BasicFields: GeminiBasicFields,
    defaults: {
      aspectRatio: '1:1',
      count: 1,
      imageSearch: false,
      imageSize: '1K',
      includeThoughts: false,
      webSearch: false,
    },
    displayName: 'Gemini 3.1 Flash Image',
    key: { kind: 'image_generation', provider: 'google', model: 'gemini-3.1-flash-image-preview' },
    mediaCapabilities: { inputImages: { max: 14 } },
    paramsSchema: GoogleGeminiImageParamsSchema,
    supportsMedia: true,
    supportsText: true,
  },
  {
    AdvancedFields: GeminiProAdvancedFields,
    BasicFields: ({ fields, form }) => (
      <GeminiBasicFields
        fields={fields}
        form={form}
        aspectRatioOptions={googleProAspectRatioOptions}
        imageSizeOptions={googleProSizeOptions}
      />
    ),
    defaults: {
      aspectRatio: '1:1',
      count: 1,
      imageSearch: false,
      imageSize: '1K',
      includeThoughts: false,
      webSearch: false,
    },
    displayName: 'Gemini 3 Pro Image',
    key: { kind: 'image_generation', provider: 'google', model: 'gemini-3-pro-image-preview' },
    mediaCapabilities: { inputImages: { max: 14 } },
    paramKeysOverride: ['aspectRatio', 'count', 'imageSize', 'webSearch'],
    paramsSchema: GoogleGeminiImageParamsSchema,
    supportsMedia: true,
    supportsText: true,
  },
  {
    AdvancedFields: ({ fields, form }) => <SeedreamAdvancedFields fields={fields} form={form} supportsPng supportsWebSearch />,
    BasicFields: ({ fields, form }) => <SeedreamBasicFields fields={fields} form={form} sizeOptions={seedream5SizeOptions} />,
    defaults: {
      count: 1,
      optimizePrompt: false,
      size: '2048x2048',
      webSearch: false,
    },
    displayName: 'Seedream 5.0',
    key: { kind: 'image_generation', provider: 'volcengine', model: 'doubao-seedream-5-0-260128' },
    mediaCapabilities: { inputImages: { max: 16 } },
    paramsSchema: VolcengineSeedreamParamsSchema,
    supportsMedia: true,
    supportsText: true,
  },
  {
    AdvancedFields: ({ fields, form }) => (
      <SeedreamAdvancedFields fields={fields} form={form} supportsPng={false} supportsWebSearch={false} />
    ),
    BasicFields: ({ fields, form }) => <SeedreamBasicFields fields={fields} form={form} sizeOptions={seedream45SizeOptions} />,
    defaults: {
      count: 1,
      optimizePrompt: false,
      size: '2048x2048',
      webSearch: false,
    },
    displayName: 'Seedream 4.5',
    key: { kind: 'image_generation', provider: 'volcengine', model: 'doubao-seedream-4-5-251128' },
    mediaCapabilities: { inputImages: { max: 16 } },
    paramKeysOverride: [
      'count',
      'maxImages',
      'optimizePrompt',
      'outputFormat',
      'sequentialImageGeneration',
      'size',
      'watermark',
    ],
    paramsSchema: VolcengineSeedreamParamsSchema,
    supportsMedia: true,
    supportsText: true,
  },
]
