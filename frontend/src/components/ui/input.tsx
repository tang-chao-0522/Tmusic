import * as React from 'react'
import { cn } from '@/lib/utils'

export function Input({ className, type = 'text', ...props }: React.ComponentProps<'input'>) {
  return <input data-slot="input" type={type} className={cn('h-10 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50', className)} {...props} />
}
