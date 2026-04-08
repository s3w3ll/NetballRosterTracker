'use client'

import { useState, useMemo } from 'react'
import { useSubEvents } from '@/api/hooks/use-sub-events'
import SubEventPanel from './SubEventPanel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Users, Copy } from 'lucide-react'

// Reuse the same court slot map as the live game tracker
const NETBALL_COURT_SLOTS: Record<string, { x: number; y: number }> = {
  GS: { x: 50, y: 15 }, GA: { x: 23.4, y: 27 }, WA: { x: 76.6, y: 40 },
  C:  { x: 50, y: 50 }, WD: { x: 23.4, y: 60 }, GD: { x: 76.6, y: 73 },
  GK: { x: 50, y: 85 },
}

interface MatchPlanEditorProps {
  match: any
  gameFormat: any
  positions: any[]
  players: any[]
}

export default function MatchPlanEditor({ match, gameFormat, positions, players }: MatchPlanEditorProps) {
  const { data: subEvents, isLoading, create, update, remove, bulkCreate } = useSubEvents(match.id)
  const [activePeriod, setActivePeriod] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)

  const periods = Array.from({ length: gameFormat?.numberOfPeriods ?? 4 }, (_, i) => i + 1)

  // Build a map: period → positionAbbr → playerId for the starting lineup (secondsElapsed = 0)
  const startingLineups = useMemo(() => {
    if (!subEvents) return {}
    const lineups: Record<number, Record<string, string>> = {}
    for (const period of periods) {
      lineups[period] = {}
    }
    for (const e of subEvents) {
      if (e.secondsElapsed === 0 && e.positionAbbr !== null) {
        lineups[e.period] = lineups[e.period] ?? {}
        lineups[e.period][e.positionAbbr] = e.playerId
      }
    }
    return lineups
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subEvents])

  const currentLineup = startingLineups[activePeriod] ?? {}

  const benchedPlayers = players.filter(p =>
    !Object.values(currentLineup).includes(p.id)
  )

  function handleDrop(e: React.DragEvent<HTMLDivElement>, positionAbbr: string) {
    e.preventDefault()
    const playerId = e.dataTransfer.getData('playerId')
    if (!playerId || !subEvents) return

    // Remove any existing starting-lineup event for this player in this period
    const existingForPlayer = subEvents.find(
      ev => ev.period === activePeriod && ev.secondsElapsed === 0 && ev.playerId === playerId
    )
    // Remove existing occupant of this position
    const existingForPosition = subEvents.find(
      ev => ev.period === activePeriod && ev.secondsElapsed === 0 && ev.positionAbbr === positionAbbr
    )

    const toRemove = [existingForPlayer?.id, existingForPosition?.id].filter(Boolean) as string[]
    Promise.all(toRemove.map(id => remove(id))).then(() => {
      create({ period: activePeriod, secondsElapsed: 0, playerId, positionAbbr })
    })
  }

  function handleBenchDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const playerId = e.dataTransfer.getData('playerId')
    if (!playerId || !subEvents) return
    const existing = subEvents.find(
      ev => ev.period === activePeriod && ev.secondsElapsed === 0 && ev.playerId === playerId
    )
    if (existing) remove(existing.id)
  }

  const copyFromPrevious = () => {
    if (activePeriod <= 1 || !subEvents) return
    const prevLineup = startingLineups[activePeriod - 1] ?? {}
    // Remove existing starting lineup for this period, then bulk-create from previous
    const existingForPeriod = subEvents.filter(
      ev => ev.period === activePeriod && ev.secondsElapsed === 0
    )
    Promise.all(existingForPeriod.map(ev => remove(ev.id))).then(() => {
      bulkCreate(
        Object.entries(prevLineup).map(([positionAbbr, playerId]) => ({
          period: activePeriod,
          secondsElapsed: 0,
          playerId,
          positionAbbr,
        }))
      )
    })
  }

  const handleCourtTap = (positionAbbr: string) => {
    if (!subEvents) return
    const occupantId = currentLineup[positionAbbr]

    // No player in hand — select the occupant (if any)
    if (!selectedPlayerId) {
      if (occupantId) setSelectedPlayerId(occupantId)
      return
    }

    // Tapping selected player's own position — deselect
    if (occupantId === selectedPlayerId) {
      setSelectedPlayerId(null)
      return
    }

    const captured = selectedPlayerId
    setSelectedPlayerId(null)

    // Find old position of selected player (if on court)
    const selectedPlayerOldPos = Object.entries(currentLineup).find(([, id]) => id === captured)?.[0]

    // Remove existing starting-lineup events for both players in this period
    const toRemove = subEvents.filter(
      ev => ev.period === activePeriod && ev.secondsElapsed === 0 &&
        (ev.playerId === captured || ev.playerId === occupantId)
    )

    Promise.all(toRemove.map(ev => remove(ev.id))).then(() => {
      const creates: Promise<string | undefined>[] = []
      // Place selected player at tapped position
      creates.push(create({ period: activePeriod, secondsElapsed: 0, playerId: captured, positionAbbr }))
      // If occupant existed and selected player had an old position, swap occupant there
      if (occupantId && selectedPlayerOldPos) {
        creates.push(create({ period: activePeriod, secondsElapsed: 0, playerId: occupantId, positionAbbr: selectedPlayerOldPos }))
      }
      return Promise.all(creates)
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const useCourtLayout = positions?.length === 7 &&
    positions.every(p => p.abbreviation in NETBALL_COURT_SLOTS)

  return (
    <div className="space-y-6">
      <Tabs value={String(activePeriod)} onValueChange={v => setActivePeriod(Number(v))}>
        <TabsList>
          {periods.map(p => (
            <TabsTrigger key={p} value={String(p)}>Q{p}</TabsTrigger>
          ))}
        </TabsList>

        {periods.map(period => (
          <TabsContent key={period} value={String(period)} className="space-y-4">
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Q{period} Starting Lineup</CardTitle>
                  <CardDescription>Drag players onto the court positions.</CardDescription>
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
                          const occupantId = currentLineup[position.abbreviation]
                          const player = players.find(p => p.id === occupantId)
                          return (
                            <div
                              key={position.id}
                              draggable={!!player}
                              onDragStart={player ? e => { e.dataTransfer.setData('playerId', player.id); setIsDragging(true) } : undefined}
                              onDragEnd={() => setIsDragging(false)}
                              onDrop={e => handleDrop(e, position.abbreviation)}
                              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                              onClick={() => handleCourtTap(position.abbreviation)}
                              style={{
                                position: 'absolute',
                                left: `${slot.x}%`,
                                top: `${slot.y}%`,
                                transform: 'translate(-50%, -50%)',
                                width: '140px',
                                height: '56px',
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
                                  <span className="text-[12px] font-bold truncate w-full text-center">
                                    {player.name.split(' ')[0]}
                                  </span>
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
                          const occupantId = currentLineup[position.abbreviation]
                          const player = players.find(p => p.id === occupantId)
                          return (
                            <div
                              key={position.id}
                              onDrop={e => handleDrop(e, position.abbreviation)}
                              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                              onClick={() => handleCourtTap(position.abbreviation)}
                              className={cn(
                                'p-3 rounded-lg border-2 border-dashed flex items-center gap-2 min-h-[60px] cursor-pointer',
                                player && player.id === selectedPlayerId
                                  ? 'border-yellow-400 ring-2 ring-yellow-400 bg-yellow-400/5'
                                  : player
                                    ? 'border-primary bg-primary/10'
                                    : 'border-muted-foreground/40'
                              )}
                            >
                              <span className="font-bold text-xs text-primary w-8">{position.abbreviation}</span>
                              {player ? (
                                <span
                                  draggable
                                  onDragStart={e => { e.dataTransfer.setData('playerId', player.id); setIsDragging(true) }}
                                  onDragEnd={() => setIsDragging(false)}
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
                    onDrop={handleBenchDrop}
                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                  >
                    <div className="flex items-center gap-1 mb-2">
                      <Users className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">Bench ({benchedPlayers.length})</span>
                    </div>
                    {benchedPlayers.map(player => (
                      <div
                        key={player.id}
                        draggable
                        onDragStart={e => { e.dataTransfer.setData('playerId', player.id); setIsDragging(true) }}
                        onDragEnd={() => setIsDragging(false)}
                        onClick={() => setSelectedPlayerId(prev => prev === player.id ? null : player.id)}
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

            {/* Mid-period substitutions for this period (exclude secondsElapsed=0 starting lineup events) */}
            {subEvents && (
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
        ))}
      </Tabs>
    </div>
  )
}
