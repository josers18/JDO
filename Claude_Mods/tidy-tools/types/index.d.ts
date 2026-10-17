export type Status = 'pending' | 'in_progress' | 'completed'
export type PlanItem = { id: string; subject: string; status: Status; activeForm?: string; doneAt?: number }

declare module 'claude-code' {
  interface PluginState {
    'tidy-tools': { isOff: boolean; frame: number; plan: PlanItem[]; goal: string; startedAt: number; fold: number }
  }
}
