import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type EmptyStateProps = {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return <div data-slot="empty-state" className={cn('flex flex-col items-center justify-center gap-3 px-5 py-9 text-center text-muted-foreground', className)}>
    {icon ? <span className="text-primary">{icon}</span> : null}
    <strong className="text-sm font-medium text-foreground">{title}</strong>
    {description ? <p className="m-0 max-w-sm text-xs leading-relaxed">{description}</p> : null}
    {action}
  </div>
}
