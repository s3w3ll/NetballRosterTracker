'use client'

import { useEffect, useState, useMemo } from 'react'
import { useFirebase } from '@/firebase'
import { apiJSON } from '@/api/client'
import { normalizeGameFormat, normalizeMatch, normalizeRoster, normalizeSubEvent, type Player } from '@/api/types'
import { proposeReplan, type ReplanProposal } from '@/lib/replan'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface ReplanDialogProps {
  tournamentId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after the new plan is saved, so the caller can reload its data */
  onApplied?: () => void
}

const mins = (s: number) => `${Math.round(s / 60)}m`
const spread = (t: Record<string, number>) => {
  const v = Object.values(t)
  return v.length ? Math.max(...v) - Math.min(...v) : 0
}

/**
 * Recalculates the plan for every unplayed quarter in a tournament so the rest
 * of the tournament makes up for time players have missed, previews the effect
 * per player, and saves it atomically on confirm.
 */
export default function ReplanDialog({ tournamentId, open, onOpenChange, onApplied }: ReplanDialogProps) {
  const { getIdToken } = useFirebase()
  const { toast } = useToast()
  const [proposal, setProposal] = useState<ReplanProposal | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [gameCount, setGameCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // (Re)compute from fresh data every time the dialog opens — the live game may have moved on
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setProposal(null)
    setError(null)
    ;(async () => {
      try {
        const tournament = await apiJSON<any>(`/api/tournaments/${tournamentId}`, getIdToken)
        const ids = new Set<string>(tournament.matchIds ?? [])
        const matches = (await apiJSON<any[]>('/api/matches', getIdToken)).map(normalizeMatch).filter(m => ids.has(m.id))
        if (matches.length === 0) throw new Error('This tournament has no games yet.')

        const formatIds = [...new Set(matches.map(m => m.gameFormatId).filter(Boolean))] as string[]
        const rosterIds = [...new Set(matches.map(m => m.team1RosterId).filter(Boolean))] as string[]
        if (formatIds.length !== 1) throw new Error('Replanning needs every game in the tournament to use the same game format.')
        if (rosterIds.length !== 1) throw new Error('Replanning needs every game in the tournament to use the same roster.')

        const [format, roster, eventLists] = await Promise.all([
          apiJSON<any>(`/api/game-formats/${formatIds[0]}`, getIdToken).then(normalizeGameFormat),
          apiJSON<any>(`/api/rosters/${rosterIds[0]}`, getIdToken).then(normalizeRoster),
          Promise.all(matches.map(m => apiJSON<any[]>(`/api/matches/${m.id}/sub-events`, getIdToken))),
        ])
        const rosterPlayers = roster.players ?? []
        const result = proposeReplan(
          matches.map((m, i) => ({ id: m.id, name: m.name, startTime: m.startTime, events: eventLists[i].map(normalizeSubEvent) })),
          { numberOfPeriods: format.numberOfPeriods, periodDuration: format.periodDuration, positions: format.positions ?? [] },
          rosterPlayers
        )
        if (cancelled) return
        setPlayers([...rosterPlayers].sort((a, b) => a.name.localeCompare(b.name)))
        setGameCount(result.changes.length)
        setProposal(result)
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Could not load the tournament.')
      }
    })()
    return () => { cancelled = true }
  }, [open, tournamentId, getIdToken])

  const spreadBefore = useMemo(() => (proposal ? spread(proposal.before) : 0), [proposal])
  const spreadAfter = useMemo(() => (proposal ? spread(proposal.after) : 0), [proposal])

  const handleApply = async () => {
    if (!proposal) return
    setIsSaving(true)
    try {
      await apiJSON(`/api/tournaments/${tournamentId}/replan`, getIdToken, {
        method: 'PUT',
        body: JSON.stringify({ matches: proposal.changes }),
      })
      toast({ title: 'Tournament replanned', description: `${proposal.openPeriodCount} quarters updated.` })
      onApplied?.()
      onOpenChange(false)
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Replan not saved', description: e.message })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Replan rest of tournament</DialogTitle>
          <DialogDescription>
            Rebuilds the plan for every quarter not yet played so the rest of the tournament makes up
            for time players have missed. Played quarters are not changed; manual edits to unplayed
            quarters are replaced.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
        ) : !proposal ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : proposal.openPeriodCount === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Every quarter has been played — there is nothing left to replan.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">
              Replans <strong>{proposal.openPeriodCount}</strong> unplayed quarter{proposal.openPeriodCount === 1 ? '' : 's'} across{' '}
              <strong>{gameCount}</strong> game{gameCount === 1 ? '' : 's'}. Gap between most and least court time:{' '}
              <strong>{mins(spreadBefore)}</strong> → <strong>{mins(spreadAfter)}</strong>.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead className="text-right">Played</TableHead>
                  <TableHead className="text-right">Current plan</TableHead>
                  <TableHead className="text-right">After replan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {players.map(p => {
                  const before = proposal.before[p.id] ?? 0
                  const after = proposal.after[p.id] ?? 0
                  const delta = Math.round((after - before) / 60)
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">{mins(proposal.playedSoFar[p.id] ?? 0)}</TableCell>
                      <TableCell className="text-right font-mono">{mins(before)}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {mins(after)}
                        {delta !== 0 && (
                          <span className={cn('ml-1 text-xs', delta > 0 ? 'text-green-600' : 'text-amber-600')}>
                            {delta > 0 ? '+' : ''}{delta}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleApply} disabled={!proposal || proposal.openPeriodCount === 0 || isSaving}>
            {isSaving ? 'Saving…' : 'Apply replan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
