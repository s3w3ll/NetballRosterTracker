'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSubEvents } from '@/api/hooks/use-sub-events'
import { useFirebase } from '@/firebase'
import { apiJSON } from '@/api/client'
import { type MatchPlan } from '@/api/types'
import SubEventPanel from './SubEventPanel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Users, Copy, ChevronLeft, Save } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { v4 as uuidv4 } from 'uuid'

// Reuse the same court slot map as the live game tracker
const NETBALL_COURT_SLOTS: Record<string, { x: number; y: number }> = {
  GS: { x: 50, y: 15 }, GA: { x: 23.4, y: 27 }, WA: { x: 76.6, y: 40 },
  C:  { x: 50, y: 50 }, WD: { x: 23.4, y: 60 }, GD: { x: 76.6, y: 73 },
  GK: { x: 50, y: 85 },
}

// Local lineup state: period → positionAbbr → playerId (null = empty)
type DraftLineups = Record<number, Record<string, string | null>>

interface MatchPlanEditorProps {
  match: any
  gameFormat: any
  positions: any[]
  players: any[]
  /** Pre-populate the editor from these match_plans when no sub-events exist (auto-generated games) */
  initialMatchPlans?: MatchPlan[]
  /** When set, show Save + Back-to-Tournament buttons and buffer all changes locally */
  tournamentId?: string | null
  /** When true (plan created from /plans/new), show Done → /plans header; saves are still real-time */
  standalone?: boolean
}

export default function MatchPlanEditor({ match, gameFormat, positions, players, initialMatchPlans, tournamentId, standalone }: MatchPlanEditorProps) {
  const router = useRouter()
  const { toast } = useToast()
  const { getIdToken } = useFirebase()
  const { data: subEvents, isLoading, create, update, remove, bulkCreate } = useSubEvents(match.id)
  const [activePeriod, setActivePeriod] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const dragJustFinished = useRef(false)

  // Whether we're in tournament context (buffer changes, show Save/Close)
  const tournamentMode = Boolean(tournamentId)

  const periods = Array.from({ length: gameFormat?.numberOfPeriods ?? 4 }, (_, i) => i + 1)

  // Build starting lineups from sub-events (secondsElapsed=0)
  const startingLineupsFromEvents = useMemo(() => {
    if (!subEvents) return {} as Record<number, Record<string, string>>
    const lineups: Record<number, Record<string, string>> = {}
    for (const period of periods) lineups[period] = {}
    for (const e of subEvents) {
      if (e.secondsElapsed === 0 && e.positionAbbr !== null) {
        lineups[e.period] = lineups[e.period] ?? {}
        lineups[e.period][e.positionAbbr] = e.playerId
      }
    }
    return lineups
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subEvents])

  // Tournament mode: local draft state
  const [draftLineups, setDraftLineups] = useState<DraftLineups | null>(null)
  const draftInitialised = useRef(false)

  useEffect(() => {
    if (!tournamentMode || isLoading || draftInitialised.current) return
    draftInitialised.current = true

    // If sub-events already have data, use them as the starting draft
    const hasSubEvents = subEvents && subEvents.some(e => e.secondsElapsed === 0)
    if (hasSubEvents) {
      const draft: DraftLineups = {}
      for (const period of periods) {
        draft[period] = {}
        for (const pos of positions) {
          draft[period][pos.abbreviation] = startingLineupsFromEvents[period]?.[pos.abbreviation] ?? null
        }
      }
      setDraftLineups(draft)
      return
    }

    // No sub-events — seed from initialMatchPlans (auto-generated tournament)
    const draft: DraftLineups = {}
    for (const period of periods) {
      draft[period] = {}
      for (const pos of positions) {
        draft[period][pos.abbreviation] = null
      }
    }
    if (initialMatchPlans) {
      for (const plan of initialMatchPlans) {
        for (const pp of plan.playerPositions) {
          if (draft[plan.quarter]) {
            draft[plan.quarter][pp.position] = pp.playerId
          }
        }
      }
    }
    setDraftLineups(draft)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentMode, isLoading, subEvents])

  // The effective lineup for display — draft in tournament mode, live events otherwise
  const currentLineup = useMemo(() => {
    if (tournamentMode && draftLineups) {
      return draftLineups[activePeriod] ?? {}
    }
    return startingLineupsFromEvents[activePeriod] ?? {}
  }, [tournamentMode, draftLineups, startingLineupsFromEvents, activePeriod])

  const benchedPlayers = players.filter(p => !Object.values(currentLineup).includes(p.id))

  // --- Draft update helpers (tournament mode) ---
  const applyDraftChange = useCallback((period: number, changes: Array<{ positionAbbr: string; playerId: string | null }>) => {
    setDraftLineups(prev => {
      if (!prev) return prev
      const next = { ...prev, [period]: { ...prev[period] } }
      for (const { positionAbbr, playerId } of changes) {
        next[period][positionAbbr] = playerId
      }
      return next
    })
  }, [])

  // --- Event handlers ---
  function handleDrop(e: React.DragEvent<HTMLDivElement>, positionAbbr: string) {
    e.preventDefault()
    const playerId = e.dataTransfer.getData('playerId')
    if (!playerId) return

    if (tournamentMode) {
      const currentPeriodDraft = draftLineups?.[activePeriod] ?? {}
      const oldPosOfPlayer = Object.entries(currentPeriodDraft).find(([, id]) => id === playerId)?.[0]
      const currentOccupantId = currentPeriodDraft[positionAbbr] ?? null
      const changes: Array<{ positionAbbr: string; playerId: string | null }> = [
        { positionAbbr, playerId },
      ]
      if (oldPosOfPlayer) changes.push({ positionAbbr: oldPosOfPlayer, playerId: currentOccupantId })
      applyDraftChange(activePeriod, changes)
      return
    }

    if (!subEvents) return
    const existingForPlayer = subEvents.find(ev => ev.period === activePeriod && ev.secondsElapsed === 0 && ev.playerId === playerId)
    const existingForPosition = subEvents.find(ev => ev.period === activePeriod && ev.secondsElapsed === 0 && ev.positionAbbr === positionAbbr)
    const toRemove = [existingForPlayer?.id, existingForPosition?.id].filter(Boolean) as string[]
    Promise.all(toRemove.map(id => remove(id))).then(() => {
      create({ period: activePeriod, secondsElapsed: 0, playerId, positionAbbr })
    })
  }

  function handleBenchDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const playerId = e.dataTransfer.getData('playerId')
    if (!playerId) return

    if (tournamentMode) {
      const currentPeriodDraft = draftLineups?.[activePeriod] ?? {}
      const oldPos = Object.entries(currentPeriodDraft).find(([, id]) => id === playerId)?.[0]
      if (oldPos) applyDraftChange(activePeriod, [{ positionAbbr: oldPos, playerId: null }])
      setSelectedPlayerId(null)
      return
    }

    if (!subEvents) return
    const existing = subEvents.find(ev => ev.period === activePeriod && ev.secondsElapsed === 0 && ev.playerId === playerId)
    if (existing) remove(existing.id)
    setSelectedPlayerId(null)
  }

  const copyFromPrevious = () => {
    if (activePeriod <= 1) return

    if (tournamentMode) {
      const prevDraft = draftLineups?.[activePeriod - 1] ?? {}
      const changes = positions.map(pos => ({
        positionAbbr: pos.abbreviation,
        playerId: prevDraft[pos.abbreviation] ?? null,
      }))
      applyDraftChange(activePeriod, changes)
      return
    }

    if (!subEvents) return
    const prevLineup = startingLineupsFromEvents[activePeriod - 1] ?? {}
    const existingForPeriod = subEvents.filter(ev => ev.period === activePeriod && ev.secondsElapsed === 0)
    Promise.all(existingForPeriod.map(ev => remove(ev.id))).then(() => {
      bulkCreate(
        Object.entries(prevLineup).map(([positionAbbr, playerId]) => ({
          period: activePeriod, secondsElapsed: 0, playerId, positionAbbr,
        }))
      )
    })
  }

  const handleCourtTap = (positionAbbr: string) => {
    if (dragJustFinished.current) { dragJustFinished.current = false; return }

    const occupantId = tournamentMode
      ? (draftLineups?.[activePeriod]?.[positionAbbr] ?? null)
      : (currentLineup[positionAbbr] ?? null)

    if (!selectedPlayerId) {
      if (occupantId) setSelectedPlayerId(occupantId)
      return
    }
    if (occupantId === selectedPlayerId) { setSelectedPlayerId(null); return }

    const captured = selectedPlayerId
    setSelectedPlayerId(null)

    if (tournamentMode) {
      const currentPeriodDraft = draftLineups?.[activePeriod] ?? {}
      const capturedOldPos = Object.entries(currentPeriodDraft).find(([, id]) => id === captured)?.[0]
      const changes: Array<{ positionAbbr: string; playerId: string | null }> = [{ positionAbbr, playerId: captured }]
      if (occupantId && capturedOldPos) changes.push({ positionAbbr: capturedOldPos, playerId: occupantId })
      else if (capturedOldPos) changes.push({ positionAbbr: capturedOldPos, playerId: null })
      applyDraftChange(activePeriod, changes)
      return
    }

    if (!subEvents) return
    const selectedPlayerOldPos = Object.entries(currentLineup).find(([, id]) => id === captured)?.[0]
    const toRemove = subEvents.filter(ev => ev.period === activePeriod && ev.secondsElapsed === 0 && (ev.playerId === captured || ev.playerId === occupantId))
    Promise.all(toRemove.map(ev => remove(ev.id))).then(() => {
      const creates = [create({ period: activePeriod, secondsElapsed: 0, playerId: captured, positionAbbr })]
      if (occupantId && selectedPlayerOldPos) {
        creates.push(create({ period: activePeriod, secondsElapsed: 0, playerId: occupantId, positionAbbr: selectedPlayerOldPos }))
      }
      return Promise.all(creates)
    })
  }

  // --- Save (tournament mode) ---
  const handleSave = async () => {
    if (!draftLineups) return
    setIsSaving(true)
    try {
      // Remove all existing starting-lineup sub-events for this match
      const toDelete = (subEvents ?? []).filter(e => e.secondsElapsed === 0)
      await Promise.all(toDelete.map(e => remove(e.id)))

      // Create new sub-events from draft
      const newEvents: Array<{ period: number; secondsElapsed: number; playerId: string; positionAbbr: string }> = []
      for (const [periodStr, lineup] of Object.entries(draftLineups)) {
        const period = Number(periodStr)
        for (const [positionAbbr, playerId] of Object.entries(lineup)) {
          if (playerId) newEvents.push({ period, secondsElapsed: 0, playerId, positionAbbr })
        }
      }
      if (newEvents.length > 0) {
        await apiJSON(`/api/matches/${match.id}/sub-events/bulk`, getIdToken, {
          method: 'POST',
          body: JSON.stringify({ events: newEvents.map(e => ({ id: uuidv4(), ...e })) }),
        })
      }

      toast({ title: 'Plan saved' })
      router.push('/tournaments/view')
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Save failed', description: err.message })
    } finally {
      setIsSaving(false)
    }
  }

  // Plan summary derived from draft (tournament mode only) — updates live as players are dragged
  const planSummary = useMemo(() => {
    if (!tournamentMode || !draftLineups) return null
    return players.map(player => {
      const posCount: Record<string, number> = {}
      let totalPeriods = 0
      for (const periodLineup of Object.values(draftLineups)) {
        for (const [posAbbr, pid] of Object.entries(periodLineup)) {
          if (pid === player.id) {
            posCount[posAbbr] = (posCount[posAbbr] ?? 0) + 1
            totalPeriods++
          }
        }
      }
      return { player, totalPeriods, posCount }
    })
  }, [tournamentMode, draftLineups, players, positions])

  const periodDurationMins = gameFormat?.periodDuration ?? 0
  const formatPlanTime = (periods: number) =>
    periods > 0 && periodDurationMins > 0 ? `${periods * periodDurationMins}m` : '—'

  if (isLoading || (tournamentMode && !draftLineups)) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const useCourtLayout = positions?.length === 7 && positions.every(p => p.abbreviation in NETBALL_COURT_SLOTS)

  return (
    <div className="space-y-6">
      {/* Standalone plan header */}
      {standalone && !tournamentMode && (
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={() => router.push('/plans')}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Plans
          </Button>
          <span className="text-sm text-muted-foreground">Changes are saved automatically</span>
          <Button size="sm" onClick={() => router.push('/plans')}>
            Done
          </Button>
        </div>
      )}

      {/* Tournament context header */}
      {tournamentMode && (
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={() => router.push('/tournaments/view')}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Tournament
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push('/tournaments/view')}>
              Close
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              <Save className="h-4 w-4 mr-1" />
              {isSaving ? 'Saving…' : 'Save Plan'}
            </Button>
          </div>
        </div>
      )}

      <Tabs value={String(activePeriod)} onValueChange={v => setActivePeriod(Number(v))}>
        <TabsList>
          {periods.map(p => (
            <TabsTrigger key={p} value={String(p)}>Q{p}</TabsTrigger>
          ))}
        </TabsList>

        {periods.map(period => {
          const periodLineup = tournamentMode
            ? (draftLineups?.[period] ?? {})
            : (startingLineupsFromEvents[period] ?? {})
          const onCourtIds = Object.values(periodLineup).filter(Boolean) as string[]
          const periodBenched = players.filter(p => !onCourtIds.includes(p.id))

          return (
          <TabsContent key={period} value={String(period)} className="space-y-4">
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Q{period} Starting Lineup</CardTitle>
                  <CardDescription>
                    {tournamentMode ? 'Drag players onto positions, then click Save Plan.' : 'Drag players onto the court positions.'}
                  </CardDescription>
                </div>
                {period > 1 && (
                  <Button size="sm" variant="outline" onClick={copyFromPrevious}>
                    <Copy className="h-3 w-3 mr-1" />
                    Copy Q{period - 1}
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex flex-col md:flex-row gap-4">
                  {/* Court */}
                  <div className="flex-1">
                    {useCourtLayout ? (
                      <div className="relative rounded-lg overflow-hidden w-full" style={{ aspectRatio: '2/3' }}>
                        <svg viewBox="0 0 400 800" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                          <rect width="400" height="800" fill="#1e6b38" rx="6" />
                          <rect x="10" y="10" width="380" height="780" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.5" />
                          <line x1="10" y1="270" x2="390" y2="270" stroke="rgba(255,255,255,0.75)" strokeWidth="1.5" />
                          <line x1="10" y1="530" x2="390" y2="530" stroke="rgba(255,255,255,0.75)" strokeWidth="1.5" />
                          <circle cx="200" cy="400" r="22" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.5" />
                        </svg>
                        {positions.map(position => {
                          const slot = NETBALL_COURT_SLOTS[position.abbreviation]
                          if (!slot) return null
                          const occupantId = periodLineup[position.abbreviation]
                          const player = players.find(p => p.id === occupantId)
                          return (
                            <div
                              key={position.id}
                              draggable={!!player}
                              onDragStart={player ? e => { e.dataTransfer.setData('playerId', player.id); setIsDragging(true) } : undefined}
                              onDragEnd={() => { setIsDragging(false); dragJustFinished.current = true }}
                              onDrop={e => { if (activePeriod === period) handleDrop(e, position.abbreviation) }}
                              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                              onClick={() => { if (activePeriod === period) handleCourtTap(position.abbreviation) }}
                              style={{
                                position: 'absolute',
                                left: `${slot.x}%`, top: `${slot.y}%`,
                                transform: 'translate(-50%, -50%)',
                                width: '140px', height: '56px',
                              }}
                              className={cn(
                                'rounded-full border-2 flex flex-col items-center justify-center text-center transition-all z-10 select-none px-2 cursor-pointer',
                                player && player.id === selectedPlayerId
                                  ? 'border-yellow-400 ring-2 ring-yellow-400 bg-primary text-primary-foreground shadow-lg'
                                  : player
                                    ? 'border-primary bg-primary text-primary-foreground shadow-lg cursor-grab'
                                    : (isDragging || selectedPlayerId)
                                      ? 'border-yellow-300/70 bg-black/40 border-dashed'
                                      : 'border-white/50 bg-black/25 border-dashed'
                              )}
                            >
                              {player ? (
                                <>
                                  <span className="text-[10px] font-bold opacity-75">{position.abbreviation}</span>
                                  <span className="text-[12px] font-bold truncate w-full text-center">{player.name.split(' ')[0]}</span>
                                </>
                              ) : (
                                <span className="text-white/80 text-sm font-bold">{position.abbreviation}</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {positions.map(position => {
                          const occupantId = periodLineup[position.abbreviation]
                          const player = players.find(p => p.id === occupantId)
                          return (
                            <div
                              key={position.id}
                              onDrop={e => { if (activePeriod === period) handleDrop(e, position.abbreviation) }}
                              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                              onClick={() => { if (activePeriod === period) handleCourtTap(position.abbreviation) }}
                              className={cn(
                                'p-3 rounded-lg border-2 border-dashed flex items-center gap-2 min-h-[60px] cursor-pointer',
                                player && player.id === selectedPlayerId
                                  ? 'border-yellow-400 ring-2 ring-yellow-400 bg-yellow-400/5'
                                  : player ? 'border-primary bg-primary/10' : 'border-muted-foreground/40'
                              )}
                            >
                              <span className="font-bold text-xs text-primary w-8">{position.abbreviation}</span>
                              {player ? (
                                <span
                                  draggable
                                  onDragStart={e => { e.dataTransfer.setData('playerId', player.id); setIsDragging(true) }}
                                  onDragEnd={() => { setIsDragging(false); dragJustFinished.current = true }}
                                  className="text-sm cursor-grab"
                                >
                                  {player.name}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">Empty</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Bench */}
                  <div
                    className={cn(
                      'w-full md:w-48 rounded-lg border-2 border-dashed p-3 transition-colors min-h-[120px]',
                      isDragging ? 'border-primary/70 bg-primary/5' : 'border-muted-foreground/40'
                    )}
                    onDrop={e => { if (activePeriod === period) handleBenchDrop(e) }}
                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                  >
                    <div className="flex items-center gap-1 mb-2">
                      <Users className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">Bench ({periodBenched.length})</span>
                    </div>
                    {periodBenched.map(player => (
                      <div
                        key={player.id}
                        draggable
                        onDragStart={e => { e.dataTransfer.setData('playerId', player.id); setIsDragging(true) }}
                        onDragEnd={() => { setIsDragging(false); dragJustFinished.current = true }}
                        onClick={() => {
                          if (dragJustFinished.current) { dragJustFinished.current = false; return }
                          setSelectedPlayerId(prev => prev === player.id ? null : player.id)
                        }}
                        className={cn(
                          'text-sm py-1 px-2 rounded cursor-pointer hover:bg-muted transition-all',
                          selectedPlayerId === player.id && 'ring-2 ring-yellow-400 bg-yellow-400/10'
                        )}
                      >
                        {player.name}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Mid-period substitutions — only shown in non-tournament (live edit) mode */}
            {!tournamentMode && subEvents && (
              <SubEventPanel
                currentPeriod={period}
                numberOfPeriods={gameFormat?.numberOfPeriods ?? 4}
                subEvents={subEvents.filter(e => e.secondsElapsed > 0)}
                players={players}
                positions={positions}
                onCreate={create}
                onUpdate={update}
                onRemove={remove}
              />
            )}
          </TabsContent>
          )
        })}
      </Tabs>

      {/* Plan summary table — tournament mode only */}
      {tournamentMode && planSummary && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Plan Summary</CardTitle>
            <CardDescription>Planned minutes per player across all periods.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  {positions.map(p => (
                    <TableHead key={p.id ?? p.abbreviation} className="text-right">{p.abbreviation}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {planSummary.map(({ player, totalPeriods, posCount }) => (
                  <TableRow key={player.id}>
                    <TableCell className="font-medium">{player.name}</TableCell>
                    <TableCell className="text-right font-semibold">{formatPlanTime(totalPeriods)}</TableCell>
                    {positions.map(p => (
                      <TableCell key={p.id ?? p.abbreviation} className="text-right text-muted-foreground">
                        {formatPlanTime(posCount[p.abbreviation] ?? 0)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Repeat Done at bottom for standalone plans */}
      {standalone && !tournamentMode && (
        <div className="flex justify-end pt-2 border-t">
          <Button onClick={() => router.push('/plans')}>
            Done
          </Button>
        </div>
      )}

      {/* Repeat Save/Back at bottom for tournament plans */}
      {tournamentMode && (
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={() => router.push('/tournaments/view')}>
            Close without saving
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="h-4 w-4 mr-1" />
            {isSaving ? 'Saving…' : 'Save Plan'}
          </Button>
        </div>
      )}
    </div>
  )
}
