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
} from '@mina/contracts/modules/tasks/image-model-params'

import type { ClientModelSpec } from './client-model-registry'
import type { NodeTaskFormApi } from '../form-context'

const option = (value: string) => ({ label: value, value })

const googleAspectRatioOptions = GOOGLE_IMAGE_ASPECT_RATIOS.map(option)
const googleProAspectRatioOptions = GOOGLE_IMAGE_PRO_ASPECT_RATIOS.map(option)
const googleSizeOptions = GOOGLE_IMAGE_SIZES.map(option)
const googleProSizeOptions = GOOGLE_IMAGE_PRO_SIZES.map(option)
const seedream5SizeOptions = VOLCENGINE_SEEDREAM_5_SIZES.map(option)
const seedream45SizeOptions = VOLCENGINE_SEEDREAM_4_5_SIZES.map(option)

const GeminiBasicFields = ({
  form,
  imageSizeOptions = googleSizeOptions,
  aspectRatioOptions = googleAspectRatioOptions,
}: {
  aspectRatioOptions?: Array<{ label: string; value: string }>
  form: NodeTaskFormApi
  imageSizeOptions?: Array<{ label: string; value: string }>
}) => (
  <>
    <form.AppField name="params.aspectRatio">
      {(field) => <field.SelectField ariaLabel="Aspect ratio" icon={ImageIcon} options={aspectRatioOptions} />}
    </form.AppField>
    <form.AppField name="params.imageSize">
      {(field) => <field.SelectField ariaLabel="Image size" icon={Camera} options={imageSizeOptions} />}
    </form.AppField>
    <form.AppField name="params.count">
      {(field) => <field.NumberField ariaLabel="Count" icon={Sparkles} max={16} min={1} step={1} />}
    </form.AppField>
  </>
)

const GeminiAdvancedFields = ({ form }: { form: NodeTaskFormApi }) => (
  <>
    <form.AppField name="params.imageSearch">
      {(field) => <field.SwitchField label="Image search grounding" />}
    </form.AppField>
    <form.AppField name="params.webSearch">
      {(field) => <field.SwitchField label="Web search grounding" />}
    </form.AppField>
    <form.AppField name="params.includeThoughts">
      {(field) => <field.SwitchField label="Include thoughts" />}
    </form.AppField>
    <form.AppField name="params.thinkingLevel">
      {(field) => (
        <field.SelectField
          label="Thinking level"
          options={[
            { label: 'Default', value: '' },
            { label: 'Minimal', value: 'minimal' },
            { label: 'High', value: 'high' },
          ]}
        />
      )}
    </form.AppField>
  </>
)

const GeminiProAdvancedFields = ({ form }: { form: NodeTaskFormApi }) => (
  <>
    <form.AppField name="params.webSearch">
      {(field) => <field.SwitchField label="Web search grounding" />}
    </form.AppField>
  </>
)

const SeedreamBasicFields = ({
  form,
  sizeOptions,
}: {
  form: NodeTaskFormApi
  sizeOptions: Array<{ label: string; value: string }>
}) => (
  <>
    <form.AppField name="params.size">
      {(field) => <field.SelectField ariaLabel="Image size" icon={ImageIcon} options={sizeOptions} />}
    </form.AppField>
    <form.AppField name="params.count">
      {(field) => <field.NumberField ariaLabel="Count" icon={Sparkles} max={16} min={1} step={1} />}
    </form.AppField>
  </>
)

const SeedreamAdvancedFields = ({
  form,
  supportsPng,
  supportsWebSearch,
}: {
  form: NodeTaskFormApi
  supportsPng: boolean
  supportsWebSearch: boolean
}) => (
  <>
    <form.AppField name="params.optimizePrompt">
      {(field) => <field.SwitchField label="Optimize prompt" />}
    </form.AppField>
    <form.AppField name="params.outputFormat">
      {(field) => (
        <field.SelectField
          label="Output format"
          options={[
            { label: 'Default', value: '' },
            ...(supportsPng ? [{ label: 'PNG', value: 'png' }] : []),
            { label: 'JPEG', value: 'jpeg' },
          ]}
        />
      )}
    </form.AppField>
    <form.AppField name="params.sequentialImageGeneration">
      {(field) => (
        <field.SelectField
          label="Sequential generation"
          options={[
            { label: 'Default', value: '' },
            { label: 'Auto', value: 'auto' },
            { label: 'Disabled', value: 'disabled' },
          ]}
        />
      )}
    </form.AppField>
    <form.AppField name="params.maxImages">
      {(field) => <field.NumberField label="Max images" max={16} min={1} step={1} />}
    </form.AppField>
    <form.AppField name="params.watermark">
      {(field) => <field.SwitchField label="Watermark" />}
    </form.AppField>
    {supportsWebSearch ? (
      <form.AppField name="params.webSearch">
        {(field) => <field.SwitchField label="Web search" />}
      </form.AppField>
    ) : null}
  </>
)

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
    paramKeys: ['aspectRatio', 'count', 'imageSearch', 'imageSize', 'includeThoughts', 'thinkingLevel', 'webSearch'],
    paramsSchema: GoogleGeminiImageParamsSchema,
    supportsMedia: true,
    supportsText: true,
  },
  {
    AdvancedFields: GeminiProAdvancedFields,
    BasicFields: ({ form }) => (
      <GeminiBasicFields form={form} aspectRatioOptions={googleProAspectRatioOptions} imageSizeOptions={googleProSizeOptions} />
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
    paramKeys: ['aspectRatio', 'count', 'imageSize', 'webSearch'],
    paramsSchema: GoogleGeminiImageParamsSchema,
    supportsMedia: true,
    supportsText: true,
  },
  {
    AdvancedFields: ({ form }) => <SeedreamAdvancedFields form={form} supportsPng supportsWebSearch />,
    BasicFields: ({ form }) => <SeedreamBasicFields form={form} sizeOptions={seedream5SizeOptions} />,
    defaults: {
      count: 1,
      optimizePrompt: false,
      size: '2048x2048',
      webSearch: false,
    },
    displayName: 'Seedream 5.0',
    key: { kind: 'image_generation', provider: 'volcengine', model: 'doubao-seedream-5-0-260128' },
    mediaCapabilities: { inputImages: { max: 16 } },
    paramKeys: [
      'count',
      'maxImages',
      'optimizePrompt',
      'outputFormat',
      'sequentialImageGeneration',
      'size',
      'watermark',
      'webSearch',
    ],
    paramsSchema: VolcengineSeedreamParamsSchema,
    supportsMedia: true,
    supportsText: true,
  },
  {
    AdvancedFields: ({ form }) => <SeedreamAdvancedFields form={form} supportsPng={false} supportsWebSearch={false} />,
    BasicFields: ({ form }) => <SeedreamBasicFields form={form} sizeOptions={seedream45SizeOptions} />,
    defaults: {
      count: 1,
      optimizePrompt: false,
      size: '2048x2048',
      webSearch: false,
    },
    displayName: 'Seedream 4.5',
    key: { kind: 'image_generation', provider: 'volcengine', model: 'doubao-seedream-4-5-251128' },
    mediaCapabilities: { inputImages: { max: 16 } },
    paramKeys: [
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
