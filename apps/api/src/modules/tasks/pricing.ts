import type { BillingMetric, Task, TaskConfig, VideoGenerationConfig } from '@mina/contracts/modules/tasks'
import type { PricingEstimateRequest } from '@mina/contracts/modules/pricing'

type VideoPricingKeyResolver = (config: VideoGenerationConfig) => string

interface ActualUsage {
  amount: number
  metric: BillingMetric
}

const defaultVideoPricingKeyFromConfig: VideoPricingKeyResolver = (config) => `resolution:${config.resolution}`

const videoPricingKeyResolvers = new Map<string, VideoPricingKeyResolver>([
  ['dev:dev-video', defaultVideoPricingKeyFromConfig],
])

export const videoPricingKeyFromConfig = (config: VideoGenerationConfig): string =>
  (videoPricingKeyResolvers.get(`${config.provider}:${config.model}`) ?? defaultVideoPricingKeyFromConfig)(config)

export const pricingInputFromConfig = (config: TaskConfig): PricingEstimateRequest => {
  if (config.kind === 'video_generation') {
    return {
      taskKind: config.kind,
      provider: config.provider,
      model: config.model,
      pricingKey: videoPricingKeyFromConfig(config),
      billingMetric: 'duration_second',
      usageAmount: config.durationSeconds,
    }
  }

  return {
    taskKind: config.kind,
    provider: config.provider,
    model: config.model,
    billingMetric: 'image',
    usageAmount: config.count,
  }
}

export const actualCostFromUsage = (task: Task, actualUsage: ActualUsage | undefined): number => {
  if (!actualUsage || actualUsage.metric !== task.cost.usage.metric || task.cost.usage.amount <= 0) {
    return task.cost.estimatedCost
  }

  return (task.cost.estimatedCost / task.cost.usage.amount) * actualUsage.amount
}
