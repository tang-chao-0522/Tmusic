import { defineDoc } from '@earendil-works/pi-durable'

export type TodoState = 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'
export type SopPlan = {
  runId: string | null
  version: number
  goal: string
  constraints: string[]
  assumptions: string[]
  missingInformation: string[]
  proposedApproach: string
  status: 'NONE' | 'ACTIVE' | 'COMPLETED' | 'BLOCKED'
  todos: Array<{ id: string; title: string; acceptance: string; dependsOn: string[]; status: TodoState; evidence: string[] }>
}

export const PlanDoc = defineDoc<SopPlan>({
  kind: 'tmusic.agent.plan', version: 1, scope: 'conversation', history: 'rewindable', fork: 'initial',
  initial: () => ({ runId: null, version: 0, goal: '', constraints: [], assumptions: [], missingInformation: [], proposedApproach: '', status: 'NONE', todos: [] }),
})

export function publicPlan(plan: SopPlan) {
  return { version: plan.version, goal: plan.goal, constraints: plan.constraints, assumptions: plan.assumptions, missingInformation: plan.missingInformation, proposedApproach: plan.proposedApproach, status: plan.status, todos: plan.todos }
}
