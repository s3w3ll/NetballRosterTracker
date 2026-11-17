'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ClipboardList, Check, SkipForward } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CourtPositions, LiveMoveEvent } from '@/lib/live-subs'
import { lineupMoves, movesSatisfied, type PlannedSubGroup } from '@/lib/live-plan'

interface PlanGuidePanelProps {
  period: number
  /** Seconds played so far this period */
  elapsedSeconds: number
  periodDurationSeconds: number
  court: CourtPositions
  /** Planned starting lineup for this period, or null if none */
  lineup: CourtPositions | null
  /** Planned mid-period subs for this period */
  groups: PlannedSubGroup[]
  skipped: Set<string>
  players: Array<{ id: string; name: string }>
  onApply: (moves: LiveMoveEvent[]) => void
  onSkip: (key: string) => void
}

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

/**
 * Shows the coach what the plan says for the current period — the planned
 * lineup and the next planned substitution — with one-tap apply. Anything
 * applied is recorded as actual; the plan itself is never changed here.
 */
export default function PlanGuidePanel({
  period, elapsedSeconds, periodDurationSeconds, court, lineup, groups, skipped, players, onApply, onSkip,
}: PlanGuidePanelProps) {
  if (!lineup && groups.length === 0) return null

  const name = (id: string) => players.find(p => p.id === id)?.name.split(' ')[0] ?? 'Unknown'
  const describe = (moves: LiveMoveEvent[]) =>
    moves.map(m => `${name(m.playerId)} → ${m.positionAbbr ?? 'bench'}`).join(' · ')

  const toLineup = lineup ? lineupMoves(court, lineup) : []
  const onLineup = lineup ? movesSatisfied(court, toLineup) : true
  const courtEmpty = Object.values(court).every(v => !v)

  const done = groups.filter(g => movesSatisfied(court, g.moves)).length
  const pending = groups.filter(g => !skipped.has(g.key) && !movesSatisfied(court, g.moves))
  const next = pending[0]
  const isDue = next ? elapsedSeconds >= next.secondsElapsed : false

  return (
    <Card className={cn('mb-3 md:mb-4 border-primary/30', isDue && 'border-amber-500 ring-1 ring-amber-500/50')}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ClipboardList className="h-4 w-4 text-primary" />
          Q{period} plan
          {groups.length > 0 && (
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {done}/{groups.length} planned subs done
            </span>
          )}
        </div>

        {lineup && (
          <div className="flex items-center justify-between gap-2 text-sm">
            {onLineup ? (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Check className="h-3 w-3" /> On the planned lineup
              </span>
            ) : (
              <>
                <span className="text-muted-foreground">
                  {courtEmpty ? 'Planned starting lineup is ready.' : 'Court differs from the planned lineup.'}
                </span>
                <Button size="sm" variant={courtEmpty ? 'default' : 'outline'} className="h-7 shrink-0" onClick={() => onApply(toLineup)}>
                  {courtEmpty ? 'Load lineup' : 'Match plan'}
                </Button>
              </>
            )}
          </div>
        )}

        {next && (
          <div className="flex items-center gap-2 text-sm rounded-md border px-2 py-1.5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs">clock {mmss(Math.max(0, periodDurationSeconds - next.secondsElapsed))}</span>
                {isDue && <Badge className="h-5 bg-amber-500 hover:bg-amber-500 text-white">Due</Badge>}
                {pending.length > 1 && <span className="text-xs text-muted-foreground">+{pending.length - 1} more</span>}
              </div>
              <div className="truncate">{describe(next.moves)}</div>
            </div>
            <Button size="sm" className="h-7 shrink-0" onClick={() => onApply(next.moves)}>Apply</Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 shrink-0" onClick={() => onSkip(next.key)} aria-label="Skip this planned sub">
              <SkipForward className="h-3 w-3" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
