import type { ComponentProps, ElementType } from 'react'
import { cn } from '@/lib/utils'

type GlassPanelProps<T extends 'div' | 'section' | 'aside' | 'header' = 'div'> = {
  as?: T
} & ComponentProps<T>

export function GlassPanel<T extends 'div' | 'section' | 'aside' | 'header' = 'div'>({ as, className, ...props }: GlassPanelProps<T>) {
  const Component = (as ?? 'div') as ElementType
  return <Component data-slot="glass-panel" className={cn('glass-panel', className)} {...props} />
}
