'use client'

import { useState } from 'react'
import { type SubEvent } from '@/api/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronDown, Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SubEventPanelProps {
  currentPeriod: number
  numberOfPeriods: number
  subEvents: SubEvent[]
  players: Array<{ id: string; name: string }>
  positions: Array<{ abbreviation: string }>
  onCreate: (event: Omit<SubEvent, 'id' | 'matchId'>) => Promise<string | undefined>
  onUpdate: (id: string, changes: { secondsElapsed: number; positionAbbr: string | null }) => Promise<void>
  onRemove: (id: string) => Promise<void>
}

function secsToMMSS(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function mmssToSecs(value: string): number | null {
  const parts = value.split(':')
  if (parts.length !== 2) return null
  const m = parseInt(parts[0], 10)
  const s = parseInt(parts[1], 10)
  if (isNaN(m) || isNaN(s) || s >= 60) return null
  return m * 60 + s
}

export default function SubEventPanel({
  currentPeriod,
  numberOfPeriods,
  subEvents,
  players,
  positions,
  onCreate,
  onUpdate,
  onRemove,
}: SubEventPanelProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTimeValue, setEditTimeValue] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [addPeriod, setAddPeriod] = useState(String(currentPeriod))
  const [addTime, setAddTime] = useState('00:00')
  const [addPlayerId, setAddPlayerId] = useState('')
  const [addPosition, setAddPosition] = useState('bench')

  const periodEvents = subEvents
    .filter(e => e.period === currentPeriod)
    .sort((a, b) => a.secondsElapsed - b.secondsElapsed)

  function handleEditStart(event: SubEvent) {
    setEditingId(event.id)
    setEditTimeValue(secsToMMSS(event.secondsElapsed))
  }

  async function handleEditSave(event: SubEvent) {
    const secs = mmssToSecs(editTimeValue)
    if (secs === null) { setEditingId(null); return }
    await onUpdate(event.id, { secondsElapsed: secs, positionAbbr: event.positionAbbr })
    setEditingId(null)
  }

  async function handleAdd() {
    const secs = mmssToSecs(addTime)
    if (secs === null || !addPlayerId) return
    await onCreate({
      period: parseInt(addPeriod, 10),
      secondsElapsed: secs,
      playerId: addPlayerId,
      positionAbbr: addPosition === 'bench' ? null : addPosition,
    })
    setShowAddForm(false)
    setAddTime('00:00')
    setAddPlayerId('')
    setAddPosition('bench')
  }

  return (
    <Card className="mt-4">
      <CardHeader
        className="cursor-pointer select-none py-3"
        onClick={() => setIsOpen(v => !v)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            Q{currentPeriod} Substitutions ({periodEvents.length})
          </CardTitle>
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
        </div>
      </CardHeader>

      {isOpen && (
        <CardContent className="pt-0 space-y-2">
          {periodEvents.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              No substitutions recorded for this period yet.
            </p>
          )}

          {periodEvents.map(event => {
            const player = players.find(p => p.id === event.playerId)
            const posLabel = event.positionAbbr ?? 'bench'
            return (
              <div key={event.id} className="flex items-center gap-2 text-sm rounded-md border px-3 py-2">
                {editingId === event.id ? (
                  <Input
                    className="w-20 h-7 font-mono text-xs"
                    value={editTimeValue}
                    onChange={e => setEditTimeValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleEditSave(event) }}
                    autoFocus
                  />
                ) : (
                  <span
                    className="font-mono text-xs w-12 cursor-pointer hover:text-primary"
                    onClick={() => handleEditStart(event)}
                    title="Click to edit time"
                  >
                    {secsToMMSS(event.secondsElapsed)}
                  </span>
                )}

                <span className="flex-1 truncate">{player?.name ?? event.playerId}</span>
                <span className="text-muted-foreground text-xs">→</span>
                <span className="font-semibold text-xs w-10">{posLabel}</span>

                {editingId === event.id ? (
                  <>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleEditSave(event)}>
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingId(null)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleEditStart(event)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => onRemove(event.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            )
          })}

          {showAddForm ? (
            <div className="border rounded-md p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Period</label>
                  <Select value={addPeriod} onValueChange={setAddPeriod}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: numberOfPeriods }, (_, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>Q{i + 1}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Time (MM:SS)</label>
                  <Input
                    className="h-8 text-xs font-mono"
                    value={addTime}
                    onChange={e => setAddTime(e.target.value)}
                    placeholder="04:30"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Player</label>
                  <Select value={addPlayerId} onValueChange={setAddPlayerId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select player" />
                    </SelectTrigger>
                    <SelectContent>
                      {players.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Position</label>
                  <Select value={addPosition} onValueChange={setAddPosition}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bench">Bench</SelectItem>
                      {positions.map(pos => (
                        <SelectItem key={pos.abbreviation} value={pos.abbreviation}>{pos.abbreviation}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="h-7 text-xs" onClick={handleAdd} disabled={!addPlayerId}>
                  Add
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="w-full h-7 text-xs"
              onClick={() => { setAddPeriod(String(currentPeriod)); setShowAddForm(true) }}
            >
              <Plus className="h-3 w-3 mr-1" /> Add substitution
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  )
}
