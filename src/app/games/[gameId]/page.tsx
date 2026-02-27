
'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useDoc, useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import { doc, collection, updateDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Timer, Users, User, Shield, Target, Circle, Feather, Footprints, Play, Pause, RefreshCw, ArrowRight, ClipboardEdit, Gamepad2, Info } from 'lucide-react';
import { useState, useEffect, useMemo, DragEvent, useRef, useCallback } from 'react';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


const iconMap: Record<string, LucideIcon> = {
    Target,
    Feather,
    Circle,
    Shield,
    User,
    Users,
    Footprints,
};

function LiveGameTracker({ match, gameFormat, positions, players }: { match: any, gameFormat: any, positions: any[], players: any[] }) {
  const [courtPositions, setCourtPositions] = useState<Record<string, string | null>>({});
  
  const [isActive, setIsActive] = useState(false);
  const [time, setTime] = useState(0);
  const [currentPeriod, setCurrentPeriod] = useState(1);
  
  const [playerTimeOnCourt, setPlayerTimeOnCourt] = useState<Record<string, number>>({});
  const [playerTimeInPosition, setPlayerTimeInPosition] = useState<Record<string, Record<string, number>>>({});

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

  const handleDragStart = (e: DragEvent<HTMLDivElement>, playerId: string) => e.dataTransfer.setData("playerId", playerId);

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

  const allowDrop = (e: DragEvent<HTMLDivElement>) => e.preventDefault();

  const benchedPlayers = players?.filter(p => !onCourtPlayerIds.includes(p.id)) || [];

  const PlayerCard = ({ player }: { player: any }) => (
      <div
          draggable
          onDragStart={(e) => handleDragStart(e, player.id)}
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Game Clock</CardTitle></CardHeader>
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
            <Card className="bg-primary/5 min-h-[400px]">
                <CardHeader>
                    <CardTitle>Court</CardTitle>
                    <CardDescription>Drag players from the bench to a position on the court.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {positions?.map(position => {
                        const playerId = courtPositions[position.abbreviation];
                        const player = players?.find(p => p.id === playerId);
                        const Icon = iconMap[position.icon] || User;
                        return (
                            <div
                                key={position.id}
                                onDrop={(e) => handleDrop(e, position.abbreviation)}
                                onDragOver={allowDrop}
                                className={cn("p-4 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 min-h-[100px]", player ? "border-primary bg-primary/10" : "border-muted-foreground/50 bg-background/30")}
                            >
                                <div className="flex items-center gap-2">
                                  <Icon className="h-5 w-5 text-primary" />
                                  <span className="font-bold text-primary">{position.abbreviation}</span>
                                </div>
                                {player ? <PlayerCard player={player}/> : <span className="text-xs text-muted-foreground">Empty</span>}
                            </div>
                        )
                    })}
                </CardContent>
            </Card>
        </div>

        <div className="lg:col-span-1">
            <Card className="min-h-[400px]" onDrop={handleBenchDrop} onDragOver={allowDrop}>
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
    </>
  )
}

// Data structure for the plan: { [period: number]: { [positionAbbr: string]: playerId | null } }
type PlayerPositionsPlan = Record<number, Record<string, string | null>>;

function MatchPlanner({ match, gameFormat, positions, players, matchPlans }: { match: any, gameFormat: any, positions: any[], players: any[], matchPlans: any[] }) {
    const { toast } = useToast();
    const { user } = useUser();
    const firestore = useFirestore();
    const [plan, setPlan] = useState<PlayerPositionsPlan>({});
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

        if (!user || !match || !periodPlan) return;
        
        const matchPlanDoc = matchPlans.find(mp => mp.quarter === period);

        if (!matchPlanDoc) {
             console.error(`Match plan for period ${period} not found!`);
             toast({ variant: "destructive", title: "Error", description: `Could not find plan for period ${period}.`});
             return;
        }

        const playerPositionsForFirestore = Object.entries(periodPlan)
            .filter(([, playerId]) => playerId !== null)
            .map(([position, playerId]) => ({ position, playerId }));

        const planRef = doc(firestore, `users/${user.uid}/matches/${match.id}/matchPlans`, matchPlanDoc.id);
        
        updateDocumentNonBlocking(planRef, { playerPositions: playerPositionsForFirestore });
        
        toast({ title: `Period ${period} plan updated.`});

        lastUpdatedPeriod.current = null;

    }, [plan, user, match, matchPlans, firestore, toast]);


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
    
    const handleDragStart = (e: DragEvent<HTMLDivElement>, playerId: string) => e.dataTransfer.setData("playerId", playerId);
    const allowDrop = (e: DragEvent<HTMLDivElement>) => e.preventDefault();

    const PlayerCard = ({ player, timeInfo, onDragStart, className }: { player: any; timeInfo: any; onDragStart: (e: DragEvent<HTMLDivElement>) => void; className?: string }) => (
        <div draggable onDragStart={onDragStart} className={cn("p-2 rounded-md bg-card border text-card-foreground shadow-sm cursor-grab active:cursor-grabbing", className)}>
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
                                                <div className={cn("flex-grow h-auto min-h-[4rem] rounded-md border-2 border-dashed flex items-center justify-center", player ? 'border-primary/50' : 'border-muted/50')}>
                                                    {player ? <PlayerCard player={player} timeInfo={periodTimeTotals[player.id]} onDragStart={(e) => handleDragStart(e, player.id)} className="w-full" /> : <span className="text-xs text-muted-foreground">Empty</span>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <h3 className="font-semibold text-center text-muted-foreground border-b pb-2 pt-4">Bench ({benchedPlayers.length})</h3>
                                <div onDrop={(e) => handleBenchDrop(e, period)} onDragOver={allowDrop} className="p-2 rounded-md border-2 border-dashed border-muted/50 min-h-[100px] flex-grow bg-muted/20">
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
  const params = useParams();
  const searchParams = useSearchParams();
  const gameId = params.gameId as string;
  const defaultMode = searchParams.get('mode') || 'live';
  
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const matchRef = useMemoFirebase(() => {
    if (!user || !gameId) return null;
    return doc(firestore, 'users', user.uid, 'matches', gameId);
  }, [firestore, user, gameId]);
  const { data: match, isLoading: isMatchLoading } = useDoc(matchRef);

  const gameFormatRef = useMemoFirebase(() => {
    if (!user || !match?.gameFormatId) return null;
    return doc(firestore, 'users', user.uid, 'gameFormats', match.gameFormatId);
  }, [firestore, user, match]);
  const { data: gameFormat, isLoading: isGameFormatLoading } = useDoc(gameFormatRef);

  const positionsQuery = useMemoFirebase(() => {
    if (!user || !gameFormat?.id) return null;
    return collection(firestore, 'users', user.uid, 'gameFormats', gameFormat.id, 'positions');
  }, [firestore, user, gameFormat]);
  const { data: positions, isLoading: arePositionsLoading } = useCollection(positionsQuery);

  const playersQuery = useMemoFirebase(() => {
    if (!user || !match?.team1RosterId) return null;
    return collection(firestore, 'users', user.uid, 'rosters', match.team1RosterId, 'players');
  }, [firestore, user, match]);
  const { data: players, isLoading: arePlayersLoading } = useCollection(playersQuery);
  
  const matchPlansQuery = useMemoFirebase(() => {
    if (!user || !gameId) return null;
    return collection(firestore, 'users', user.uid, 'matches', gameId, 'matchPlans');
  }, [firestore, user, gameId]);
  const { data: matchPlans, isLoading: areMatchPlansLoading } = useCollection(matchPlansQuery);

  const isLoading = isUserLoading || isMatchLoading || arePlayersLoading || isGameFormatLoading || arePositionsLoading || areMatchPlansLoading;

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

  if (!match || !gameFormat || !positions || !players || !matchPlans) {
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
    <div className="container mx-auto py-8 px-4">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold font-headline">{match.name || 'Live Game'}</h1>
        <p className="text-muted-foreground">Managing your game and strategy.</p>
      </div>
      
      <Tabs defaultValue={defaultMode} className="w-full">
        <TabsList className="grid w-full max-w-sm mx-auto grid-cols-2 mb-8">
          <TabsTrigger value="live">
            <Gamepad2 className="mr-2 h-4 w-4" />
            Live Game
            </TabsTrigger>
          <TabsTrigger value="plan">
            <ClipboardEdit className="mr-2 h-4 w-4" />
            Match Plan
          </TabsTrigger>
        </TabsList>

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
 

    
