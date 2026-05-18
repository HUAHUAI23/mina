import type { BillingMetric, Task } from '@mina/contracts/modules/tasks'

interface ActualUsage {
  amount: number
  metric: BillingMetric
}

export const actualCostFromUsage = (task: Task, actualUsage: ActualUsage | undefined): number => {
  if (!actualUsage || actualUsage.metric !== task.cost.usage.metric || task.cost.usage.amount <= 0) {
    return task.cost.estimatedCost
  }

  return (task.cost.estimatedCost / task.cost.usage.amount) * actualUsage.amount
}
