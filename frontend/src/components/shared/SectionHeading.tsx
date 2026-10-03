import { ArrowRight } from 'lucide-react'
import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

type SectionHeadingProps = HTMLAttributes<HTMLElement> & {
  title: ReactNode
  action?: ReactNode
}

export function SectionHeading({ title, action, className, ...props }: SectionHeadingProps) {
  return <header className={cn(className)} {...props}>
    <h3>{title}</h3>{action ?? <ArrowRight size={18} aria-hidden="true" />}
  </header>
}
