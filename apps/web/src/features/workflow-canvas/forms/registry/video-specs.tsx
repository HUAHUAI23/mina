import { Clock, Image as ImageIcon, MonitorPlay } from 'lucide-react'
import {
  GOOGLE_VIDEO_ASPECT_RATIOS,
  GOOGLE_VIDEO_DURATIONS,
  GOOGLE_VIDEO_PERSON_GENERATION,
  GOOGLE_VIDEO_RESOLUTIONS,
  GoogleVeoParamsSchema,
  VOLCENGINE_VIDEO_RATIOS,
  VOLCENGINE_VIDEO_RESOLUTIONS,
  VOLCENGINE_VIDEO_SERVICE_TIERS,
  VolcengineSeedanceParamsSchema,
  type GoogleVeoParams,
  type VolcengineSeedanceParams,
} from '@mina/contracts/modules/tasks/video-model-params'

import type { ClientModelSpec } from './client-model-registry'
import { withNodeTaskFieldGroup } from '../form-context'

const option = (value: string) => ({ label: value, value })
const numericOption = (value: number) => ({ label: `${value}s`, value: String(value) })

const googleAspectRatioOptions = GOOGLE_VIDEO_ASPECT_RATIOS.map(option)
const googleDurationOptions = GOOGLE_VIDEO_DURATIONS.map(numericOption)
const googlePersonGenerationOptions = GOOGLE_VIDEO_PERSON_GENERATION.map(option)
const googleResolutionOptions = GOOGLE_VIDEO_RESOLUTIONS.map(option)
const volcengineRatioOptions = VOLCENGINE_VIDEO_RATIOS.map(option)
const volcengineResolutionOptions = VOLCENGINE_VIDEO_RESOLUTIONS.map(option)
const volcengineServiceTierOptions = [{ label: 'Default', value: '' }, ...VOLCENGINE_VIDEO_SERVICE_TIERS.map(option)]

const GoogleVeoBasicFields = withNodeTaskFieldGroup<Partial<GoogleVeoParams>, unknown>({
  defaultValues: {},
  render: ({ group }) => (
    <>
      <group.AppField name="aspectRatio">
        {(field) => <field.SelectField ariaLabel="Aspect ratio" icon={ImageIcon} options={googleAspectRatioOptions} />}
      </group.AppField>
      <group.AppField name="durationSeconds">
        {(field) => <field.SelectField ariaLabel="Duration" icon={Clock} options={googleDurationOptions} valueKind="number" />}
      </group.AppField>
      <group.AppField name="resolution">
        {(field) => <field.SelectField ariaLabel="Resolution" icon={MonitorPlay} options={googleResolutionOptions} />}
      </group.AppField>
    </>
  ),
})

const GoogleVeoAdvancedFields = withNodeTaskFieldGroup<Partial<GoogleVeoParams>, unknown>({
  defaultValues: {},
  render: ({ group }) => (
    <>
      <group.AppField name="personGeneration">
        {(field) => <field.SelectField label="Person generation" options={googlePersonGenerationOptions} />}
      </group.AppField>
    </>
  ),
})

const SeedanceBasicFields = withNodeTaskFieldGroup<Partial<VolcengineSeedanceParams>, unknown, {
  maxDuration: number
  minDuration: number
  supports1080p: boolean
}>({
  defaultValues: {},
  render: ({ group, maxDuration, minDuration, supports1080p }) => (
    <>
      <group.AppField name="ratio">
        {(field) => <field.SelectField ariaLabel="Ratio" icon={ImageIcon} options={volcengineRatioOptions} />}
      </group.AppField>
      <group.AppField name="durationSeconds">
        {(field) => <field.NumberField ariaLabel="Duration" icon={Clock} max={maxDuration} min={minDuration} step={1} />}
      </group.AppField>
      <group.AppField name="resolution">
        {(field) => (
          <field.SelectField
            ariaLabel="Resolution"
            icon={MonitorPlay}
            options={volcengineResolutionOptions.filter((item) => supports1080p || item.value !== '1080p')}
          />
        )}
      </group.AppField>
    </>
  ),
})

const SeedanceAdvancedFields = withNodeTaskFieldGroup<Partial<VolcengineSeedanceParams>, unknown, {
  supportsCameraFixed: boolean
  supportsGenerateAudio: boolean
  supportsReturnLastFrame: boolean
  supportsServiceTier: boolean
  supportsWebSearch: boolean
}>({
  defaultValues: {},
  render: ({
    group,
    supportsCameraFixed,
    supportsGenerateAudio,
    supportsReturnLastFrame,
    supportsServiceTier,
    supportsWebSearch,
  }) => (
    <>
      {supportsGenerateAudio ? (
        <group.AppField name="generateAudio">
          {(field) => <field.SwitchField label="Generate audio" />}
        </group.AppField>
      ) : null}
      {supportsCameraFixed ? (
        <group.AppField name="cameraFixed">
          {(field) => <field.SwitchField label="Fixed camera" />}
        </group.AppField>
      ) : null}
      {supportsReturnLastFrame ? (
        <group.AppField name="returnLastFrame">
          {(field) => <field.SwitchField label="Return last frame" />}
        </group.AppField>
      ) : null}
      {supportsServiceTier ? (
        <group.AppField name="serviceTier">
          {(field) => <field.SelectField label="Service tier" options={volcengineServiceTierOptions} />}
        </group.AppField>
      ) : null}
      {supportsWebSearch ? (
        <group.AppField name="webSearch">
          {(field) => <field.SwitchField label="Web search" />}
        </group.AppField>
      ) : null}
    </>
  ),
})

export const videoClientModelSpecs: ClientModelSpec[] = [
  {
    AdvancedFields: GoogleVeoAdvancedFields,
    BasicFields: GoogleVeoBasicFields,
    defaults: {
      aspectRatio: '16:9',
      durationSeconds: 8,
      personGeneration: 'allow_all',
      resolution: '720p',
    },
    displayName: 'Veo 3.1',
    key: { kind: 'video_generation', provider: 'google', model: 'veo-3.1-generate-preview' },
    mediaCapabilities: { firstFrame: true, lastFrame: true, referenceImages: { max: 3 } },
    paramsSchema: GoogleVeoParamsSchema,
    supportsMedia: true,
    supportsText: true,
  },
  {
    AdvancedFields: GoogleVeoAdvancedFields,
    BasicFields: GoogleVeoBasicFields,
    defaults: {
      aspectRatio: '16:9',
      durationSeconds: 8,
      personGeneration: 'allow_all',
      resolution: '720p',
    },
    displayName: 'Veo 3.1 Fast',
    key: { kind: 'video_generation', provider: 'google', model: 'veo-3.1-fast-generate-preview' },
    mediaCapabilities: { firstFrame: true, lastFrame: true, referenceImages: { max: 3 } },
    paramsSchema: GoogleVeoParamsSchema,
    supportsMedia: true,
    supportsText: true,
  },
  {
    AdvancedFields: ({ fields, form }) => (
      <SeedanceAdvancedFields
        fields={fields}
        form={form}
        supportsCameraFixed={false}
        supportsGenerateAudio
        supportsReturnLastFrame={false}
        supportsServiceTier={false}
        supportsWebSearch
      />
    ),
    BasicFields: ({ fields, form }) => (
      <SeedanceBasicFields fields={fields} form={form} minDuration={4} maxDuration={15} supports1080p={false} />
    ),
    defaults: {
      durationSeconds: 5,
      generateAudio: false,
      ratio: '16:9',
      resolution: '720p',
      returnLastFrame: false,
      webSearch: false,
    },
    displayName: 'Seedance 2.0',
    key: { kind: 'video_generation', provider: 'volcengine', model: 'doubao-seedance-2-0-260128' },
    mediaCapabilities: { firstFrame: true, lastFrame: true, referenceAudios: { max: 3 }, referenceImages: { max: 12 }, referenceVideos: { max: 3 } },
    paramsSchema: VolcengineSeedanceParamsSchema,
    supportsMedia: true,
    supportsText: true,
  },
  {
    AdvancedFields: ({ fields, form }) => (
      <SeedanceAdvancedFields
        fields={fields}
        form={form}
        supportsCameraFixed
        supportsGenerateAudio
        supportsReturnLastFrame
        supportsServiceTier
        supportsWebSearch={false}
      />
    ),
    BasicFields: ({ fields, form }) => (
      <SeedanceBasicFields fields={fields} form={form} minDuration={4} maxDuration={12} supports1080p />
    ),
    defaults: {
      cameraFixed: false,
      durationSeconds: 5,
      generateAudio: false,
      ratio: '16:9',
      resolution: '720p',
      returnLastFrame: false,
    },
    displayName: 'Seedance 1.5 Pro',
    key: { kind: 'video_generation', provider: 'volcengine', model: 'doubao-seedance-1-5-pro-251215' },
    mediaCapabilities: { firstFrame: true, lastFrame: true, referenceAudios: { max: 0 }, referenceImages: { max: 2 }, referenceVideos: { max: 0 } },
    paramsSchema: VolcengineSeedanceParamsSchema,
    supportsMedia: true,
    supportsText: true,
  },
  {
    AdvancedFields: ({ fields, form }) => (
      <SeedanceAdvancedFields
        fields={fields}
        form={form}
        supportsCameraFixed={false}
        supportsGenerateAudio
        supportsReturnLastFrame={false}
        supportsServiceTier={false}
        supportsWebSearch={false}
      />
    ),
    BasicFields: ({ fields, form }) => (
      <SeedanceBasicFields fields={fields} form={form} minDuration={4} maxDuration={15} supports1080p={false} />
    ),
    defaults: {
      durationSeconds: 5,
      generateAudio: false,
      ratio: '16:9',
      resolution: '720p',
      returnLastFrame: false,
      webSearch: false,
    },
    displayName: 'Jimeng Seedance 2.0',
    key: { kind: 'video_generation', provider: 'volcengine', model: 'jimeng-video-seedance-2.0' },
    mediaCapabilities: { firstFrame: true, lastFrame: true, referenceAudios: { max: 3 }, referenceImages: { max: 12 }, referenceVideos: { max: 3 } },
    paramsSchema: VolcengineSeedanceParamsSchema,
    supportsMedia: true,
    supportsText: true,
  },
  {
    AdvancedFields: ({ fields, form }) => (
      <SeedanceAdvancedFields
        fields={fields}
        form={form}
        supportsCameraFixed={false}
        supportsGenerateAudio
        supportsReturnLastFrame={false}
        supportsServiceTier={false}
        supportsWebSearch={false}
      />
    ),
    BasicFields: ({ fields, form }) => (
      <SeedanceBasicFields fields={fields} form={form} minDuration={4} maxDuration={15} supports1080p={false} />
    ),
    defaults: {
      durationSeconds: 5,
      generateAudio: false,
      ratio: '16:9',
      resolution: '720p',
      returnLastFrame: false,
      webSearch: false,
    },
    displayName: 'Jimeng Seedance 2.0 Fast',
    key: { kind: 'video_generation', provider: 'volcengine', model: 'jimeng-video-seedance-2.0-fast' },
    mediaCapabilities: { firstFrame: true, lastFrame: true, referenceAudios: { max: 3 }, referenceImages: { max: 12 }, referenceVideos: { max: 3 } },
    paramsSchema: VolcengineSeedanceParamsSchema,
    supportsMedia: true,
    supportsText: true,
  },
]
