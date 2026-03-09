'use client';

import { useSearchParams } from 'next/navigation';
import { useFirebase } from '@/firebase';
import { useMatch } from '@/api/hooks/use-matches';
import { useGameFormat } from '@/api/hooks/use-game-formats';
import { useRoster } from '@/api/hooks/use-rosters';
import { useMatchPlans } from '@/api/hooks/use-match-plans';
import { upsertMatchPlanNonBlocking } from '@/firebase/non-blocking-updates';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Timer, Users, User, Shield, Target, Circle, Feather, Footprints, Play, Pause, RefreshCw, ArrowRight, ClipboardEdit, Gamepad2 } from 'lucide-react';
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

  const [playerTimeOnCourt, setPlayerTimeOnCourt] = useState<Record<string, number>>({});
  const [playerTimeInPosition, setPlayerTimeInPosition] = useState<Record<string, Record<string, number>>>({});
  const [isDragging, setIsDragging] = useState(false);

  const lastUpdateTime = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

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

        setPlayerTimeOnCourt(currentCourtTimes => {
            const newCourtTimes = { ...currentCourtTimes };
            Object.keys(newPosTimes).forEach(playerId => {
                newCourtTimes[playerId] = Object.values(newPosTimes[playerId]).reduce((sum: number, time: any) => sum + time, 0);
            });
            return newCourtTimes;
        });

        return newPosTimes;
    });
}, [courtPositions, isActive]);


  useEffect(() => {
    if (players && positions) {
      const initialTimeOnCourt = players.reduce((acc, player) => ({ ...acc, [player.id]: 0 }), {});
      const initialTimeInPosition = players.reduce((acc, player) => ({
        ...acc,
        [player.id]: positions.reduce((posAcc, pos) => ({ ...posAcc, [pos.abbreviation]: 0 }), {})
      }), {});
      setPlayerTimeOnCourt(initialTimeOnCourt);
      setPlayerTimeInPosition(initialTimeInPosition);
    }
  }, [players, positions]);

  useEffect(() => {
    if (gameFormat) {
      setTime(gameFormat.periodDuration * 60);
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
      intervalRef.current = setInterval(() => {
        setTime(prevTime => {
            if (prevTime <= 1) {
                if (intervalRef.current) clearInterval(intervalRef.current);
                updatePlayerTimes();
                setIsActive(false);
                lastUpdateTime.current = null;
                return 0;
            }
            updatePlayerTimes();
            return prevTime - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        updatePlayerTimes();
        lastUpdateTime.current = null;
      }
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive, updatePlayerTimes]);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  };

  const toggleTimer = () => setIsActive(!isActive);
  const resetTimer = () => {
    setIsActive(false);
    setTime(gameFormat?.periodDuration * 60 || 0);
  };

  const advancePeriod = () => {
    if (!gameFormat || currentPeriod >= gameFormat.numberOfPeriods) return;
    if (isActive) setIsActive(false);
    setCurrentPeriod(prev => prev + 1);
    setTime(gameFormat.periodDuration * 60);
    lastUpdateTime.current = null;
  };

  const handleDragStart = (e: DragEvent<HTMLDivElement>, playerId: string) => {
    e.dataTransfer.setData("playerId", playerId);
    e.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
  };

  const handleDragEnd = () => setIsDragging(false);

  const handleDrop = (e: DragEvent<HTMLDivElement>, positionAbbr: string) => {
      e.preventDefault();
      const playerId = e.dataTransfer.getData("playerId");
      if (!playerId) return;
      updatePlayerTimes();
      setCourtPositions(prev => {
          const newPositions = { ...prev };
          const currentOccupantId = newPositions[positionAbbr];
          const oldPosOfDraggedPlayer = Object.keys(newPositions).find(p => newPositions[p] === playerId);
          if (oldPosOfDraggedPlayer) {
              newPositions[oldPosOfDraggedPlayer] = currentOccupantId;
          }
          newPositions[positionAbbr] = playerId;
          return newPositions;
      });
  };

  const handleBenchDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const playerId = e.dataTransfer.getData("playerId");
    if (!playerId) return;
    updatePlayerTimes();
    setCourtPositions(prev => {
        const newPositions = { ...prev };
        const oldPosOfDraggedPlayer = Object.keys(newPositions).find(p => newPositions[p] === playerId);
        if (oldPosOfDraggedPlayer) newPositions[oldPosOfDraggedPlayer] = null;
        return newPositions;
    });
  };

  const allowDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const useCourtLayout = positions ? hasNetballCourtLayout(positions.map(p => p.abbreviation)) : false;

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
    <div className="flex flex-col md:flex-row gap-6 items-start">

      {/* ── Court (left, 60% of page width) ────────────────────── */}
      <div className="w-[60%] flex-shrink-0 min-w-0">
        <Card className="bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle>Court</CardTitle>
            <CardDescription>Drag players onto the court.</CardDescription>
          </CardHeader>
          <CardContent className={cn(useCourtLayout ? "flex justify-center pb-4" : "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4")}>
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
                      style={{
                        position: 'absolute',
                        left: `${slot.x}%`,
                        top: `${slot.y}%`,
                        transform: 'translate(-50%, -50%)',
                        width: '190px',
                        height: '70px',
                      }}
                      className={cn(
                        "rounded-full border-2 flex flex-col items-center justify-center text-center transition-all duration-150 z-10 select-none px-3",
                        player
                          ? "border-primary bg-primary text-primary-foreground shadow-lg cursor-grab active:cursor-grabbing"
                          : isDragging
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

      {/* ── Right column: clock → period → bench ───────────────── */}
      <div className="flex flex-col gap-4 flex-1 min-w-0">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Game Clock</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold font-mono tracking-tighter">{formatTime(time)}</div>
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
  )
}

// Data structure for the plan: { [period: number]: { [positionAbbr: string]: playerId | null } }
type PlayerPositionsPlan = Record<number, Record<string, string | null>>;

function MatchPlanner({ match, gameFormat, positions, players, matchPlans }: { match: any, gameFormat: any, positions: any[], players: any[], matchPlans: any[] }) {
    const { toast } = useToast();
    const { getIdToken } = useFirebase();
    const [plan, setPlan] = useState<PlayerPositionsPlan>({});
    const [isDragging, setIsDragging] = useState(false);
    const lastUpdatedPeriod = useRef<number | null>(null);

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
            .filter(([, playerId]) => playerId !== null)
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
  const defaultMode = searchParams.get('mode') || 'live';

  const { data: match, isLoading: isMatchLoading } = useMatch(gameId);
  const { data: gameFormat, isLoading: isGameFormatLoading } = useGameFormat(match?.gameFormatId);
  const { data: roster, isLoading: isRosterLoading } = useRoster(match?.team1RosterId);
  const { data: matchPlans, isLoading: areMatchPlansLoading } = useMatchPlans(gameId);

  const positions = gameFormat?.positions ?? [];
  const players = roster?.players ?? [];

  const isLoading = isMatchLoading || isGameFormatLoading || isRosterLoading || areMatchPlansLoading;

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

  if (!match || !gameFormat || !matchPlans) {
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
          <MatchPlanner match={match} gameFormat={gameFormat} positions={positions} players={players} matchPlans={matchPlans} />
        </TabsContent>

      </Tabs>
    </div>
  );
}
