'use client';

import { useSearchParams } from 'next/navigation';
import { useFirebase } from '@/firebase';
import { useMatch } from '@/api/hooks/use-matches';
import { useGameFormat } from '@/api/hooks/use-game-formats';
import { useRoster } from '@/api/hooks/use-rosters';
import { useMatchPlansMultiple } from '@/api/hooks/use-match-plans-multiple';
import { useSubEvents } from '@/api/hooks/use-sub-events';
import SubEventPanel from '@/app/games/play/components/SubEventPanel';
import MatchPlanEditor from '@/app/games/play/components/MatchPlanEditor';
import { useTournaments } from '@/api/hooks/use-tournaments';
import { v4 as uuidv4 } from 'uuid'
import {
  createSubEventNonBlocking,
  bulkCreateSubEventsNonBlocking,
} from '@/firebase/non-blocking-updates';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Timer, Users, User, Shield, Target, Circle, Feather, Footprints, Play, Pause, RefreshCw, ArrowRight, ClipboardEdit, Gamepad2, ChevronDown } from 'lucide-react';
import { useState, useEffect, useMemo, DragEvent, useRef, useCallback } from 'react';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getNavId } from '@/lib/nav';


const iconMap: Record<string, LucideIcon> = {
    Target,
    Feather,
    Circle,
    Shield,
    User,
    Users,
    Footprints,
};

// Positions as (x%, y%) of the court container — attack end at top, defence at bottom.
// Pills are centred on these coordinates via transform: translate(-50%, -50%), so positioning
// works at any court width. The SVG viewBox (0 0 400 800) keeps markings proportional.
const NETBALL_COURT_SLOTS: Record<string, { x: number; y: number }> = {
  GS: { x: 50,   y: 15 },
  GA: { x: 23.4, y: 27 },
  WA: { x: 76.6, y: 40 },
  C:  { x: 50,   y: 50 },
  WD: { x: 23.4, y: 60 },
  GD: { x: 76.6, y: 73 },
  GK: { x: 50,   y: 85 },
};

function hasNetballCourtLayout(abbrs: string[]): boolean {
  return abbrs.length === 7 && abbrs.every(a => a in NETBALL_COURT_SLOTS);
}

function LiveGameTracker({ match, gameFormat, positions, players }: { match: any, gameFormat: any, positions: any[], players: any[] }) {
  const [courtPositions, setCourtPositions] = useState<Record<string, string | null>>({});

  const [isActive, setIsActive] = useState(false);
  const [time, setTime] = useState(0);
  const [currentPeriod, setCurrentPeriod] = useState(1);

  const [playerTimeInPosition, setPlayerTimeInPosition] = useState<Record<string, Record<string, number>>>({});
  // Derived from playerTimeInPosition — avoids a second setState and the extra render it causes.
  const playerTimeOnCourt = useMemo(() => {
    const totals: Record<string, number> = {};
    Object.entries(playerTimeInPosition).forEach(([playerId, positions]) => {
      totals[playerId] = Object.values(positions).reduce((sum: number, t: any) => sum + t, 0);
    });
    return totals;
  }, [playerTimeInPosition]);
  const [isDragging, setIsDragging] = useState(false);
  const [isEditingTimer, setIsEditingTimer] = useState(false)
  const [timerInputValue, setTimerInputValue] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)

  const lastUpdateTime = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const dragJustFinished = useRef(false)
  const periodStartTime = useRef<number | null>(null);
  const periodDuration = useRef<number>(0);

  const { getIdToken } = useFirebase()
  const initialLineupStamped = useRef(false)

  const { data: subEvents, create: createSubEvent, update: updateSubEvent, remove: removeSubEvent } = useSubEvents(match.id)

  const onCourtPlayerIds = useMemo(() => Object.values(courtPositions).filter(Boolean) as string[], [courtPositions]);

  const updatePlayerTimes = useCallback(() => {
    if (!isActive) {
        lastUpdateTime.current = null;
        return;
    }

    const now = Date.now();
    const timeElapsedSeconds = lastUpdateTime.current ? Math.round((now - lastUpdateTime.current) / 1000) : 0;
    lastUpdateTime.current = now;

    if (timeElapsedSeconds <= 0) return;

    setPlayerTimeInPosition(currentPosTimes => {
        const newPosTimes = JSON.parse(JSON.stringify(currentPosTimes));
        Object.entries(courtPositions).forEach(([posAbbr, playerId]) => {
            if (playerId) {
                if (!newPosTimes[playerId]) newPosTimes[playerId] = {};
                newPosTimes[playerId][posAbbr] = (newPosTimes[playerId][posAbbr] || 0) + timeElapsedSeconds;
            }
        });
        return newPosTimes;
    });
}, [courtPositions, isActive]);


  useEffect(() => {
    if (players && positions) {
      const initialTimeInPosition = players.reduce((acc, player) => ({
        ...acc,
        [player.id]: positions.reduce((posAcc, pos) => ({ ...posAcc, [pos.abbreviation]: 0 }), {})
      }), {});
      setPlayerTimeInPosition(initialTimeInPosition);
    }
  }, [players, positions]);

  useEffect(() => {
    if (gameFormat) {
      const durationSeconds = gameFormat.periodDuration * 60;
      periodDuration.current = durationSeconds;
      setTime(durationSeconds);
    }
  }, [gameFormat]);

  useEffect(() => {
      if (positions) {
          const initialPositions = positions.reduce((acc, pos) => ({ ...acc, [pos.abbreviation]: null }), {});
          setCourtPositions(initialPositions);
      }
  }, [positions]);

  useEffect(() => {
    if (isActive) {
      if (lastUpdateTime.current === null) {
          lastUpdateTime.current = Date.now();
      }
      if (periodStartTime.current === null) {
          periodStartTime.current = Date.now();
      }
      intervalRef.current = setInterval(() => {
        const now = Date.now();
        const elapsedSeconds = Math.floor((now - periodStartTime.current!) / 1000);
        const remainingTime = Math.max(0, periodDuration.current - elapsedSeconds);

        setTime(remainingTime);

        if (remainingTime <= 0) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            updatePlayerTimes();
            setIsActive(false);
            lastUpdateTime.current = null;
            periodStartTime.current = null;
        } else {
            updatePlayerTimes();
        }
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        updatePlayerTimes();
        lastUpdateTime.current = null;
        periodStartTime.current = null;
      }
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive, updatePlayerTimes]);

  useEffect(() => {
    if (initialLineupStamped.current) return
    const hasPlayers = Object.values(courtPositions).some(Boolean)
    if (!hasPlayers) return

    initialLineupStamped.current = true
    const startingEvents = Object.entries(courtPositions)
      .filter(([, playerId]) => playerId !== null)
      .map(([positionAbbr, playerId]) => ({
        id: uuidv4(),
        period: 1,
        secondsElapsed: 0,
        playerId: playerId!,
        positionAbbr,
      }))

    if (startingEvents.length > 0) {
      bulkCreateSubEventsNonBlocking(match.id, startingEvents, getIdToken)
    }
  }, [courtPositions, match.id, getIdToken])

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  };

  const toggleTimer = () => setIsActive(!isActive);
  const resetTimer = () => {
    setIsActive(false);
    setTime(gameFormat?.periodDuration * 60 || 0);
    periodStartTime.current = null;
  };

  const advancePeriod = () => {
    if (!gameFormat || currentPeriod >= gameFormat.numberOfPeriods) return
    if (isActive) setIsActive(false)

    const nextPeriod = currentPeriod + 1

    const startingLineupEvents = Object.entries(courtPositions)
      .filter(([, playerId]) => playerId !== null)
      .map(([positionAbbr, playerId]) => ({
        id: uuidv4(),
        period: nextPeriod,
        secondsElapsed: 0,
        playerId: playerId!,
        positionAbbr,
      }))

    bulkCreateSubEventsNonBlocking(match.id, startingLineupEvents, getIdToken)

    setCurrentPeriod(nextPeriod)
    setTime(gameFormat.periodDuration * 60)
    lastUpdateTime.current = null
    periodStartTime.current = null
  }

  const handleTimerClick = () => {
    if (isActive) setIsActive(false)
    setTimerInputValue(formatTime(time))
    setIsEditingTimer(true)
  }

  const handleTimerInputConfirm = () => {
    const parts = timerInputValue.split(':')
    if (parts.length === 2) {
      const mins = parseInt(parts[0], 10)
      const secs = parseInt(parts[1], 10)
      if (!isNaN(mins) && !isNaN(secs)) {
        const newRemainingTime = mins * 60 + secs
        setTime(newRemainingTime)
        // Recalculate periodStartTime so timestamp-based calculation produces correct remaining time
        const now = Date.now()
        const elapsedTime = periodDuration.current - newRemainingTime
        periodStartTime.current = now - (elapsedTime * 1000)
      }
    }
    setIsEditingTimer(false)
  }

  const handleCourtTap = (positionAbbr: string) => {
    if (dragJustFinished.current) {
      dragJustFinished.current = false
      return
    }
    const occupantId = courtPositions[positionAbbr]

    // No player in hand — select the occupant (if any)
    if (!selectedPlayerId) {
      if (occupantId) setSelectedPlayerId(occupantId)
      return
    }

    // Tapping the selected player's own position — deselect
    if (occupantId === selectedPlayerId) {
      setSelectedPlayerId(null)
      return
    }

    // Place or swap
    updatePlayerTimes()
    const secondsElapsed = gameFormat ? gameFormat.periodDuration * 60 - time : 0
    const captured = selectedPlayerId

    setCourtPositions(prev => {
      const newPositions = { ...prev }
      const oldPosOfSelected = Object.keys(newPositions).find(p => newPositions[p] === captured)

      // If selected player was on court, move the occupant to their old position
      if (oldPosOfSelected) {
        newPositions[oldPosOfSelected] = occupantId ?? null
        if (occupantId) {
          createSubEventNonBlocking(match.id, {
            id: uuidv4(), period: currentPeriod, secondsElapsed,
            playerId: occupantId, positionAbbr: oldPosOfSelected,
          }, getIdToken)
        }
      }

      // Place selected player at tapped position
      newPositions[positionAbbr] = captured
      createSubEventNonBlocking(match.id, {
        id: uuidv4(), period: currentPeriod, secondsElapsed,
        playerId: captured, positionAbbr,
      }, getIdToken)

      return newPositions
    })

    setSelectedPlayerId(null)
  }

  const handleDragStart = (e: DragEvent<HTMLDivElement>, playerId: string) => {
    e.dataTransfer.setData("playerId", playerId);
    e.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
  };

  const handleDragEnd = () => {
    setIsDragging(false)
    dragJustFinished.current = true
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>, positionAbbr: string) => {
    e.preventDefault()
    const playerId = e.dataTransfer.getData('playerId')
    if (!playerId) return

    updatePlayerTimes()

    const secondsElapsed = gameFormat
      ? gameFormat.periodDuration * 60 - time
      : 0

    setCourtPositions(prev => {
      const newPositions = { ...prev }
      const currentOccupantId = newPositions[positionAbbr]
      const oldPosOfDraggedPlayer = Object.keys(newPositions).find(p => newPositions[p] === playerId)

      if (oldPosOfDraggedPlayer) {
        newPositions[oldPosOfDraggedPlayer] = currentOccupantId
        if (currentOccupantId) {
          createSubEventNonBlocking(match.id, {
            id: uuidv4(),
            period: currentPeriod,
            secondsElapsed,
            playerId: currentOccupantId,
            positionAbbr: oldPosOfDraggedPlayer,
          }, getIdToken)
        }
      }

      newPositions[positionAbbr] = playerId

      createSubEventNonBlocking(match.id, {
        id: uuidv4(),
        period: currentPeriod,
        secondsElapsed,
        playerId,
        positionAbbr,
      }, getIdToken)

      return newPositions
    })
  }

  const handleBenchDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const playerId = e.dataTransfer.getData('playerId')
    if (!playerId) return

    updatePlayerTimes()

    const secondsElapsed = gameFormat
      ? gameFormat.periodDuration * 60 - time
      : 0

    setCourtPositions(prev => {
      const newPositions = { ...prev }
      const oldPosOfDraggedPlayer = Object.keys(newPositions).find(p => newPositions[p] === playerId)
      if (oldPosOfDraggedPlayer) {
        newPositions[oldPosOfDraggedPlayer] = null
        createSubEventNonBlocking(match.id, {
          id: uuidv4(),
          period: currentPeriod,
          secondsElapsed,
          playerId,
          positionAbbr: null,
        }, getIdToken)
      }
      return newPositions
    })
    setSelectedPlayerId(null)
  }

  const allowDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const useCourtLayout = positions ? hasNetballCourtLayout(positions.map(p => p.abbreviation)) : false;
  const courtGridCols = positions?.length === 6 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3';

  const benchedPlayers = players?.filter(p => !onCourtPlayerIds.includes(p.id)) || [];

  const PlayerCard = ({ player }: { player: any }) => (
      <div
          draggable
          onDragStart={(e) => handleDragStart(e, player.id)}
          onDragEnd={handleDragEnd}
          className="p-3 rounded-lg bg-card border shadow-sm cursor-grab active:cursor-grabbing"
      >
          <div className="flex justify-between items-center mb-2">
              <span className="font-bold text-card-foreground">{player.name}</span>
              <Badge variant="secondary" className="font-mono text-xs">{formatTime(playerTimeOnCourt[player.id] || 0)}</Badge>
          </div>
          <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {positions && Object.entries(playerTimeInPosition[player.id] || {}).map(([posAbbr, timeInPos]) => (
                  (timeInPos || 0) > 0 ? (
                      <div key={posAbbr} className="flex items-center gap-1">
                          <span className="font-semibold">{posAbbr}:</span>
                          <span className="font-mono">{formatTime(timeInPos as number)}</span>
                      </div>
                  ) : null
              ))}
          </div>
      </div>
  );

  return (
    <>
    {/* ── Mobile top bar: clock + period controls (hidden on md+) ── */}
    <div className="flex md:hidden items-center justify-between gap-2 p-3 mb-3 rounded-lg border bg-card">
      <div className="flex items-center gap-1">
        {isEditingTimer ? (
          <input
            type="text"
            className="text-xl font-bold font-mono w-20 bg-transparent border-b-2 border-primary focus:outline-none"
            value={timerInputValue}
            onChange={e => setTimerInputValue(e.target.value)}
            onBlur={handleTimerInputConfirm}
            onKeyDown={e => { if (e.key === 'Enter') handleTimerInputConfirm() }}
            autoFocus
          />
        ) : (
          <span
            className="text-xl font-bold font-mono cursor-pointer hover:text-primary transition-colors"
            title="Tap to correct timer"
            onClick={handleTimerClick}
          >
            {formatTime(time)}
          </span>
        )}
        <Button size="sm" variant="outline" onClick={toggleTimer} className="h-7 px-2" aria-label={isActive ? 'Pause timer' : 'Start timer'}>
          {isActive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
        </Button>
        <Button size="sm" variant="ghost" onClick={resetTimer} className="h-7 px-2" aria-label="Reset timer">
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold whitespace-nowrap">Q{currentPeriod}/{gameFormat?.numberOfPeriods}</span>
        <Button
          size="sm"
          variant="outline"
          onClick={advancePeriod}
          disabled={currentPeriod >= (gameFormat?.numberOfPeriods || 4)}
          className="h-7 px-2"
          aria-label="Advance to next period"
        >
          <ArrowRight className="h-3 w-3" />
        </Button>
      </div>
    </div>
    <div className="flex flex-col md:flex-row gap-6 items-start">

      {/* ── Court (left, 60% of page width) ────────────────────── */}
      <div className="w-full md:w-[60%] flex-shrink-0 min-w-0">
        <Card className="bg-primary/5">
          <CardHeader className="pb-2 hidden md:block">
            <CardTitle>Court</CardTitle>
            <CardDescription>Drag players onto the court.</CardDescription>
          </CardHeader>
          <CardContent className={cn(useCourtLayout ? "p-2 md:p-6 flex justify-center pb-2 md:pb-4" : "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4")}>
            {useCourtLayout ? (
              /* SVG netball court for 7-aside — scales to container, attack end at top */
              <div className="relative rounded-lg overflow-hidden w-full" style={{ aspectRatio: '2/3' }}>
                <svg viewBox="0 0 400 800" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="ncGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1a5c30" />
                      <stop offset="50%" stopColor="#1e6b38" />
                      <stop offset="100%" stopColor="#1a5c30" />
                    </linearGradient>
                    {/* Clip attack D to the in-court half (y ≥ 10) */}
                    <clipPath id="ncAttackHalf">
                      <rect x="0" y="10" width="400" height="260" />
                    </clipPath>
                    {/* Clip defence D to the in-court half (y ≤ 790) */}
                    <clipPath id="ncDefenceHalf">
                      <rect x="0" y="530" width="400" height="260" />
                    </clipPath>
                  </defs>
                  <rect width="400" height="800" fill="url(#ncGrad)" rx="6" />
                  {/* Court outline */}
                  <rect x="10" y="10" width="380" height="780" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.5" />
                  {/* Third lines: 780/3=260px each */}
                  <line x1="10" y1="270" x2="390" y2="270" stroke="rgba(255,255,255,0.75)" strokeWidth="1.5" />
                  <line x1="10" y1="530" x2="390" y2="530" stroke="rgba(255,255,255,0.75)" strokeWidth="1.5" />
                  {/* Centre circle r=22 */}
                  <circle cx="200" cy="400" r="22" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.5" />
                  <circle cx="200" cy="400" r="2.5" fill="rgba(255,255,255,0.75)" />
                  {/* Goal D circles r=124 — clipped to show only the in-court semicircle */}
                  <circle cx="200" cy="10" r="124" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.5" clipPath="url(#ncAttackHalf)" />
                  <circle cx="200" cy="790" r="124" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.5" clipPath="url(#ncDefenceHalf)" />
                  {/* Goal posts */}
                  <rect x="193" y="5" width="14" height="10" rx="2" fill="#FFC107" />
                  <rect x="193" y="785" width="14" height="10" rx="2" fill="#FFC107" />
                  {/* End labels */}
                  <text x="200" y="46" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.4)" letterSpacing="1.5" fontFamily="sans-serif">ATTACK</text>
                  <text x="200" y="772" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.4)" letterSpacing="1.5" fontFamily="sans-serif">DEFENCE</text>
                </svg>
                {positions?.map(position => {
                  const slot = NETBALL_COURT_SLOTS[position.abbreviation];
                  if (!slot) return null;
                  const playerId = courtPositions[position.abbreviation];
                  const player = players?.find(p => p.id === playerId);
                  const timeInPos = player ? (playerTimeInPosition[player.id]?.[position.abbreviation] || 0) : 0;
                  return (
                    <div
                      key={position.id}
                      draggable={!!player}
                      onDragStart={player ? (e) => handleDragStart(e, player.id) : undefined}
                      onDragEnd={handleDragEnd}
                      onDrop={(e) => handleDrop(e, position.abbreviation)}
                      onDragOver={allowDrop}
                      onClick={() => handleCourtTap(position.abbreviation)}
                      style={{
                        position: 'absolute',
                        left: `${slot.x}%`,
                        top: `${slot.y}%`,
                        transform: 'translate(-50%, -50%)',
                        width: isMobile ? '110px' : '190px',
                        height: isMobile ? '52px' : '70px',
                      }}
                      className={cn(
                        "rounded-full border-2 flex flex-col items-center justify-center text-center transition-all duration-150 z-10 select-none px-3 cursor-pointer",
                        player && player.id === selectedPlayerId
                          ? "border-yellow-400 ring-2 ring-yellow-400 bg-primary text-primary-foreground shadow-lg"
                          : player
                            ? "border-primary bg-primary text-primary-foreground shadow-lg cursor-grab active:cursor-grabbing"
                            : (isDragging || selectedPlayerId)
                              ? "border-yellow-300/70 bg-black/40 border-dashed"
                              : "border-white/50 bg-black/25 border-dashed"
                      )}
                    >
                      {player ? (
                        <>
                          <div className="flex items-center gap-1 leading-none">
                            <span className="text-[10px] font-bold opacity-75">{position.abbreviation}</span>
                            {timeInPos > 0 && (
                              <span className="text-[10px] font-mono opacity-75">· {formatTime(timeInPos)}</span>
                            )}
                          </div>
                          <span className="text-[13px] font-bold truncate w-full text-center leading-tight mt-0.5">
                            {player.name.split(' ')[0]}
                          </span>
                        </>
                      ) : (
                        <span className="text-white/80 text-sm font-bold">{position.abbreviation}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Grid fallback for non-7-aside game formats */
              <>
                {positions?.map(position => {
                  const playerId = courtPositions[position.abbreviation];
                  const player = players?.find(p => p.id === playerId);
                  const Icon = iconMap[position.icon] || User;
                  return (
                    <div
                      key={position.id}
                      onDrop={(e) => handleDrop(e, position.abbreviation)}
                      onDragOver={allowDrop}
                      className={cn("p-4 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 min-h-[100px] transition-colors", player ? "border-primary bg-primary/10" : isDragging ? "border-primary/70 bg-primary/5 ring-2 ring-primary/20" : "border-muted-foreground/50 bg-background/30")}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-5 w-5 text-primary" />
                        <span className="font-bold text-primary">{position.abbreviation}</span>
                      </div>
                      {player ? <PlayerCard player={player}/> : <span className="text-xs text-muted-foreground">Empty</span>}
                    </div>
                  )
                })}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Mobile bench strip (hidden on md+) ──────────────── */}
      <div className="flex md:hidden w-full rounded-lg border bg-card px-3 py-2" onDrop={handleBenchDrop} onDragOver={allowDrop}>
        <div className="flex gap-2 overflow-x-auto w-full py-1 items-center">
          {benchedPlayers.length === 0 ? (
            <p className="text-xs text-muted-foreground self-center w-full text-center py-2">All players on court</p>
          ) : (
            benchedPlayers.map(player => (
              <div
                key={player.id}
                draggable
                onDragStart={(e) => handleDragStart(e, player.id)}
                onDragEnd={handleDragEnd}
                onClick={() => {
                  if (dragJustFinished.current) { dragJustFinished.current = false; return }
                  setSelectedPlayerId(prev => prev === player.id ? null : player.id)
                }}
                className={cn(
                  "flex-shrink-0 px-3 py-2 rounded-lg border cursor-pointer text-center min-w-[72px] transition-all",
                  selectedPlayerId === player.id
                    ? "border-yellow-400 ring-2 ring-yellow-400 bg-yellow-400/10"
                    : "border-border bg-card"
                )}
              >
                <div className="text-sm font-bold">{player.name.split(' ')[0]}</div>
                <div className="text-xs font-mono text-muted-foreground">{formatTime(playerTimeOnCourt[player.id] || 0)}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Right column: clock → period → bench ───────────────── */}
      <div className="hidden md:flex flex-col gap-4 flex-1 min-w-0">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Game Clock</CardTitle>
          </CardHeader>
          <CardContent>
            {isEditingTimer ? (
              <input
                type="text"
                className="text-4xl font-bold font-mono tracking-tighter w-32 bg-transparent border-b-2 border-primary focus:outline-none"
                value={timerInputValue}
                onChange={e => setTimerInputValue(e.target.value)}
                onBlur={handleTimerInputConfirm}
                onKeyDown={e => { if (e.key === 'Enter') handleTimerInputConfirm() }}
                autoFocus
              />
            ) : (
              <div
                className="text-4xl font-bold font-mono tracking-tighter cursor-pointer hover:text-primary transition-colors"
                title="Tap to correct timer"
                onClick={handleTimerClick}
              >
                {formatTime(time)}
              </div>
            )}
            <div className="flex items-center gap-2 mt-2">
              <Button size="sm" variant="outline" onClick={toggleTimer}>
                {isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                <span className="ml-2">{isActive ? 'Pause' : 'Start'}</span>
              </Button>
              <Button size="sm" variant="ghost" onClick={resetTimer}><RefreshCw className="h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Current Period</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Period {currentPeriod} / {gameFormat?.numberOfPeriods}</div>
            <Button size="sm" variant="outline" onClick={advancePeriod} disabled={currentPeriod >= (gameFormat?.numberOfPeriods || 4)} className="mt-2">
              Next Period <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <Card className={cn("flex-1 transition-colors", isDragging && "ring-2 ring-primary/20")} onDrop={handleBenchDrop} onDragOver={allowDrop}>
          <CardHeader>
            <CardTitle>Bench ({benchedPlayers.length})</CardTitle>
            <CardDescription>Drag players from here onto the court.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {benchedPlayers.map(player => <PlayerCard key={player.id} player={player}/>)}
            {benchedPlayers.length === 0 && <p className="text-sm text-center text-muted-foreground pt-10">No players on the bench</p>}
          </CardContent>
        </Card>
      </div>

    </div>

    {subEvents && (
      <SubEventPanel
        currentPeriod={currentPeriod}
        numberOfPeriods={gameFormat?.numberOfPeriods ?? 4}
        subEvents={subEvents}
        players={players}
        positions={positions}
        onCreate={createSubEvent}
        onUpdate={updateSubEvent}
        onRemove={removeSubEvent}
      />
    )}
    </>
  )
}

// Data structure for the plan: { [period: number]: { [positionAbbr: string]: playerId | null } }
type PlayerPositionsPlan = Record<number, Record<string, string | null>>;

type PlayerTimeInfo = { total: number; positions: Record<string, number> };

function TournamentHistoryPanel({
    tournamentName,
    otherMatchCount,
    plansLoading,
    playerTimeTotals,
    players,
    positions,
}: {
    tournamentName: string;
    otherMatchCount: number;
    plansLoading: boolean;
    playerTimeTotals: Record<string, PlayerTimeInfo>;
    players: any[];
    positions: any[];
}) {
    const [isOpen, setIsOpen] = useState(true);
    const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}m`;
    const hasAnyData = players.some(p => (playerTimeTotals[p.id]?.total || 0) > 0);

    return (
        <Card className="mb-6">
            <CardHeader
                className="cursor-pointer select-none pb-3"
                onClick={() => setIsOpen(v => !v)}
            >
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-base">Tournament History — {tournamentName}</CardTitle>
                        <CardDescription>
                            {otherMatchCount === 0
                                ? 'No other games in this tournament yet'
                                : `Player time across ${otherMatchCount} other game${otherMatchCount === 1 ? '' : 's'} in this tournament`}
                        </CardDescription>
                    </div>
                    <ChevronDown className={cn('h-5 w-5 text-muted-foreground transition-transform duration-200', isOpen && 'rotate-180')} />
                </div>
            </CardHeader>
            {isOpen && (
                <CardContent>
                    {plansLoading ? (
                        <div className="space-y-2">
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-8 w-full" />
                        </div>
                    ) : otherMatchCount === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-2">Add more matches to this tournament to see accumulated player time here.</p>
                    ) : !hasAnyData ? (
                        <p className="text-sm text-muted-foreground text-center py-2">No plans have been saved for other games in this tournament yet.</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Player</TableHead>
                                    <TableHead className="text-right">Total</TableHead>
                                    {positions.map((p: any) => (
                                        <TableHead key={p.id} className="text-right">{p.abbreviation}</TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {[...players].sort((a, b) => a.name.localeCompare(b.name)).map((player: any) => {
                                    const timeInfo = playerTimeTotals[player.id];
                                    return (
                                        <TableRow key={player.id}>
                                            <TableCell className="font-medium">{player.name}</TableCell>
                                            <TableCell className="text-right font-mono">
                                                {timeInfo?.total ? formatTime(timeInfo.total) : '—'}
                                            </TableCell>
                                            {positions.map((p: any) => (
                                                <TableCell key={p.id} className="text-right font-mono">
                                                    {timeInfo?.positions[p.abbreviation] ? formatTime(timeInfo.positions[p.abbreviation]) : '—'}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            )}
        </Card>
    );
}

function MatchPlanner({ match, gameFormat, positions, players, matchPlans }: { match: any, gameFormat: any, positions: any[], players: any[], matchPlans: any[] }) {
    const { toast } = useToast();
    const { getIdToken } = useFirebase();
    const [plan, setPlan] = useState<PlayerPositionsPlan>({});
    const [isDragging, setIsDragging] = useState(false);
    const lastUpdatedPeriod = useRef<number | null>(null);

    // Tournament history: find if this match belongs to a tournament
    const { data: tournaments } = useTournaments();
    const currentTournament = useMemo(
        () => tournaments?.find(t => t.matchIds.includes(match.id)) ?? null,
        [tournaments, match.id]
    );
    const otherMatchIds = useMemo(
        () => currentTournament?.matchIds.filter(id => id !== match.id) ?? [],
        [currentTournament, match.id]
    );
    const { data: otherPlansData, isLoading: otherPlansLoading } = useMatchPlansMultiple(otherMatchIds);
    const otherMatchTimeTotals = useMemo((): Record<string, PlayerTimeInfo> => {
        if (!otherPlansData || !players.length || !gameFormat) return {};
        const periodDuration = gameFormat.periodDuration * 60;
        const totals: Record<string, PlayerTimeInfo> = players.reduce(
            (acc, p) => ({ ...acc, [p.id]: { total: 0, positions: {} } }),
            {}
        );
        otherPlansData.forEach(plan => {
            plan.playerPositions.forEach(({ playerId, position }) => {
                if (totals[playerId]) {
                    totals[playerId].total += periodDuration;
                    totals[playerId].positions[position] = (totals[playerId].positions[position] || 0) + periodDuration;
                }
            });
        });
        return totals;
    }, [otherPlansData, players, gameFormat]);

    useEffect(() => {
        if (!gameFormat || !positions || !matchPlans) return;

        const initialPlan: PlayerPositionsPlan = {};
        for (let i = 1; i <= gameFormat.numberOfPeriods; i++) {
            initialPlan[i] = positions.reduce((acc, pos) => ({ ...acc, [pos.abbreviation]: null }), {});
        }

        matchPlans.forEach(mp => {
            if (mp.quarter >= 1 && mp.quarter <= gameFormat.numberOfPeriods) {
                if (!initialPlan[mp.quarter]) {
                    initialPlan[mp.quarter] = positions.reduce((acc, pos) => ({ ...acc, [pos.abbreviation]: null }), {});
                }
                mp.playerPositions.forEach((p: { position: string, playerId: string }) => {
                    if (initialPlan[mp.quarter].hasOwnProperty(p.position)) {
                        initialPlan[mp.quarter][p.position] = p.playerId;
                    }
                });
            }
        });
        setPlan(initialPlan);
    }, [matchPlans, gameFormat, positions]);

    useEffect(() => {
        if (lastUpdatedPeriod.current === null) return;

        const period = lastUpdatedPeriod.current;
        const periodPlan = plan[period];

        if (!match || !periodPlan) return;

        const matchPlanDoc = matchPlans.find(mp => mp.quarter === period);

        if (!matchPlanDoc) {
             console.error(`Match plan for period ${period} not found!`);
             toast({ variant: "destructive", title: "Error", description: `Could not find plan for period ${period}.`});
             return;
        }

        const playerPositionsForFirestore = Object.entries(periodPlan)
            .filter((entry): entry is [string, string] => entry[1] !== null)
            .map(([position, playerId]) => ({ position, playerId }));

        upsertMatchPlanNonBlocking(match.id, { id: matchPlanDoc.id, quarter: period, playerPositions: playerPositionsForFirestore }, getIdToken);

        toast({ title: `Period ${period} plan updated.`});

        lastUpdatedPeriod.current = null;

    }, [plan, match, matchPlans, getIdToken, toast]);


    const handleDrop = (e: DragEvent<HTMLDivElement>, period: number, positionAbbr: string) => {
        e.preventDefault();
        const playerId = e.dataTransfer.getData("playerId");
        if (!playerId) return;

        lastUpdatedPeriod.current = period;

        setPlan(currentPlan => {
            const newPlan = JSON.parse(JSON.stringify(currentPlan));
            const periodPlan = newPlan[period];

            const oldPosOfDraggedPlayer = Object.keys(periodPlan).find(p => periodPlan[p] === playerId);
            const currentOccupantId = periodPlan[positionAbbr];

            if (oldPosOfDraggedPlayer) {
                periodPlan[oldPosOfDraggedPlayer] = currentOccupantId;
            }

            periodPlan[positionAbbr] = playerId;
            return newPlan;
        });
    };

    const handleBenchDrop = (e: DragEvent<HTMLDivElement>, period: number) => {
        e.preventDefault();
        const playerId = e.dataTransfer.getData("playerId");
        if (!playerId) return;

        lastUpdatedPeriod.current = period;

        setPlan(currentPlan => {
            const newPlan = JSON.parse(JSON.stringify(currentPlan));
            const periodPlan = newPlan[period];
            const oldPos = Object.keys(periodPlan).find(p => periodPlan[p] === playerId);
            if (oldPos) {
                periodPlan[oldPos] = null;
            }
            return newPlan;
        });
    };

    const handleDragStart = (e: DragEvent<HTMLDivElement>, playerId: string) => {
        e.dataTransfer.setData("playerId", playerId);
        e.dataTransfer.effectAllowed = 'move';
        setIsDragging(true);
    };
    const handleDragEnd = () => setIsDragging(false);
    const allowDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const PlayerCard = ({ player, timeInfo, onDragStart, className }: { player: any; timeInfo: any; onDragStart: (e: DragEvent<HTMLDivElement>) => void; className?: string }) => (
        <div draggable onDragStart={onDragStart} onDragEnd={handleDragEnd} className={cn("p-2 rounded-md bg-card border text-card-foreground shadow-sm cursor-grab active:cursor-grabbing", className)}>
            <div className="flex justify-between items-center mb-1">
                <span className="font-semibold text-sm">{player.name}</span>
                <Badge variant="secondary" className="font-mono text-xs">{formatTime(timeInfo?.total || 0)}</Badge>
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
                {timeInfo && Object.entries(timeInfo.positions).length > 0 ? (
                    Object.entries(timeInfo.positions).map(([pos, time]) => (
                        (time as number) > 0 &&
                        <div key={pos} className="flex justify-between">
                            <span>{pos}:</span>
                            <span className="font-mono">{formatTime(time as number)}</span>
                        </div>
                    ))
                ) : <p className="text-center">No time planned</p>}
            </div>
        </div>
    );

    const timeCalculations = useMemo(() => {
        if (!players || !gameFormat || Object.keys(plan).length === 0) return {};

        const runningTotals: Record<number, Record<string, { total: number, positions: Record<string, number> }>> = {};
        const periodDuration = gameFormat.periodDuration * 60;

        for (let i = 1; i <= gameFormat.numberOfPeriods; i++) {
            runningTotals[i] = players.reduce((acc, p) => ({ ...acc, [p.id]: { total: 0, positions: {} } }), {});
        }

        for (let i = 1; i <= gameFormat.numberOfPeriods; i++) {
            if (i > 1) {
                players.forEach(p => {
                    runningTotals[i][p.id] = JSON.parse(JSON.stringify(runningTotals[i-1][p.id]));
                });
            }

            const periodPlan = plan[i] || {};
            Object.entries(periodPlan).forEach(([pos, playerId]) => {
                if (playerId && runningTotals[i][playerId]) {
                    const playerPeriodData = runningTotals[i][playerId];
                    playerPeriodData.total += periodDuration;
                    if (!playerPeriodData.positions[pos]) {
                        playerPeriodData.positions[pos] = 0;
                    }
                    playerPeriodData.positions[pos] += periodDuration;
                }
            });
        }
        return runningTotals;
    }, [plan, players, gameFormat]);

    const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}m`;

    if (!players || !gameFormat || !positions || !matchPlans) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Match Planner</CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                    <p className="text-muted-foreground">Loading planner data...</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            {currentTournament && (
                <TournamentHistoryPanel
                    tournamentName={currentTournament.name}
                    otherMatchCount={otherMatchIds.length}
                    plansLoading={otherPlansLoading}
                    playerTimeTotals={otherMatchTimeTotals}
                    players={players}
                    positions={positions}
                />
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                {Array.from({ length: gameFormat.numberOfPeriods }, (_, i) => i + 1).map(period => {
                    const periodPlan = plan[period] || {};
                    const periodTimeTotals = timeCalculations[period] || {};
                    const onCourtPlayerIds = Object.values(periodPlan).filter(Boolean);
                    const benchedPlayers = players.filter(p => !onCourtPlayerIds.includes(p.id));

                    return (
                        <Card key={period} className="flex flex-col">
                            <CardHeader>
                                <CardTitle>Period {period}</CardTitle>
                            </CardHeader>
                            <CardContent className="flex-grow space-y-4">
                                <h3 className="font-semibold text-center text-muted-foreground border-b pb-2">On Court ({onCourtPlayerIds.length})</h3>
                                <div className="space-y-3 min-h-[280px]">
                                    {positions.map(position => {
                                        const playerId = periodPlan[position.abbreviation];
                                        const player = players.find(p => p.id === playerId);
                                        const Icon = iconMap[position.icon] || User;
                                        return (
                                            <div key={position.id} onDrop={(e) => handleDrop(e, period, position.abbreviation)} onDragOver={allowDrop} className="flex items-center gap-2">
                                                <div className="flex items-center gap-1 w-12 text-muted-foreground">
                                                    <Icon className="h-4 w-4" />
                                                    <span className="font-bold text-xs">{position.abbreviation}</span>
                                                </div>
                                                <div className={cn("flex-grow h-auto min-h-[4rem] rounded-md border-2 border-dashed flex items-center justify-center transition-colors", player ? 'border-primary/50' : isDragging ? 'border-primary/70 bg-primary/5 ring-2 ring-primary/20' : 'border-muted/50')}>
                                                    {player ? <PlayerCard player={player} timeInfo={periodTimeTotals[player.id]} onDragStart={(e) => handleDragStart(e, player.id)} className="w-full" /> : <span className="text-xs text-muted-foreground">Empty</span>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <h3 className="font-semibold text-center text-muted-foreground border-b pb-2 pt-4">Bench ({benchedPlayers.length})</h3>
                                <div onDrop={(e) => handleBenchDrop(e, period)} onDragOver={allowDrop} className={cn("p-2 rounded-md border-2 border-dashed min-h-[100px] flex-grow transition-colors", isDragging ? "border-primary/70 bg-primary/5 ring-2 ring-primary/20" : "border-muted/50 bg-muted/20")}>
                                    <div className="grid grid-cols-1 gap-2">
                                        {benchedPlayers.map(player => (
                                            <PlayerCard key={player.id} player={player} timeInfo={periodTimeTotals[player.id]} onDragStart={(e) => handleDragStart(e, player.id)} />
                                        ))}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}

export default function GamePage() {
  const searchParams = useSearchParams();
  const gameId = getNavId('gameId');
  const tournamentId = getNavId('tournamentId');
  const defaultMode = searchParams.get('mode') || 'live';
  const standalone = defaultMode === 'plan' && !tournamentId;

  const { data: match, isLoading: isMatchLoading } = useMatch(gameId);
  const { data: gameFormat, isLoading: isGameFormatLoading } = useGameFormat(match?.gameFormatId);
  const { data: roster, isLoading: isRosterLoading } = useRoster(match?.team1RosterId);
  const { data: currentGamePlans } = useMatchPlansMultiple(gameId ? [gameId] : []);

  const positions = gameFormat?.positions ?? [];
  const players = roster?.players ?? [];

  const isLoading = isMatchLoading || isGameFormatLoading || isRosterLoading;

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Skeleton className="h-8 w-1/2 mx-auto mb-2" />
        <Skeleton className="h-5 w-1/3 mx-auto mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!gameId) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-xl">
        <Alert variant="destructive">
          <AlertTitle>No Game Selected</AlertTitle>
          <AlertDescription>Please start a game from the Games page.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!match || !gameFormat) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-xl">
        <Alert variant="destructive">
          <AlertTitle>Match Data Not Found</AlertTitle>
          <AlertDescription>Some data required for this match could not be found. It may still be loading or does not exist.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-4 px-4">
      <Tabs defaultValue={defaultMode} className="w-full">

        {/* Title row + tab toggle inline */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold font-headline">{match.name || 'Live Game'}</h1>
            <p className="text-sm text-muted-foreground">Managing your game and strategy.</p>
          </div>
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="live">
              <Gamepad2 className="mr-2 h-4 w-4" />
              Live Game
            </TabsTrigger>
            <TabsTrigger value="plan">
              <ClipboardEdit className="mr-2 h-4 w-4" />
              Match Plan
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="live">
          <LiveGameTracker match={match} gameFormat={gameFormat} positions={positions} players={players} />
        </TabsContent>
        <TabsContent value="plan">
          <MatchPlanEditor
            match={match}
            gameFormat={gameFormat}
            positions={positions}
            players={players}
            tournamentId={tournamentId}
            initialMatchPlans={currentGamePlans ?? undefined}
            standalone={standalone}
          />
        </TabsContent>

      </Tabs>
    </div>
  );
}
