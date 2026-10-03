import { Skeleton } from '@/components/ui/skeleton'

export function TrackRowSkeleton({ count = 4 }: { count?: number }) {
  return <div data-slot="track-row-skeleton" className="space-y-2 py-3" role="status" aria-label="正在加载歌曲">
    {Array.from({ length: count }, (_, index) => <div key={index} className="flex h-[60px] items-center gap-3 border-b border-white/10">
      <Skeleton className="size-[50px] shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-2"><Skeleton className="h-3 w-2/5" /><Skeleton className="h-2 w-1/4" /></div>
      <Skeleton className="h-2 w-16" />
    </div>)}
  </div>
}
