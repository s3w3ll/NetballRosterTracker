'use client';

import { useParams } from 'next/navigation';
import { useDoc, useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import { doc, collection } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Timer, Users, User, Shield, Target, Circle, Feather, Footprints, Play, Pause, RefreshCw, ArrowRight } from 'lucide-react';
import { useState, useEffect, useMemo, DragEvent, useRef, useCallback } from 'react';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';


const iconMap: Record<string, LucideIcon> = {
    Target,
    Feather,
    Circle,
    Shield,
    User,
    Users,
    Footprints,
};


export default function GameTrackerPage() {
  const params = useParams();
  const gameId = params.gameId as string;
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const [courtPositions, setCourtPositions] = useState<Record<string, string | null>>({});
  
  const [isActive, setIsActive] = useState(false);
  const [time, setTime] = useState(0); // This is the time remaining in the period
  const [currentPeriod, setCurrentPeriod] = useState(1);
  
  const [playerTimeOnCourt, setPlayerTimeOnCourt] = useState<Record<string, number>>({});
  const [playerTimeInPosition, setPlayerTimeInPosition] = useState<Record<string, Record<string, number>>>({});

  const lastUpdateTime = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

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
  
  const onCourtPlayerIds = useMemo(() => Object.values(courtPositions).filter(Boolean) as string[], [courtPositions]);
  
  const updatePlayerTimes = useCallback(() => {
    if (!isActive) {
        lastUpdateTime.current = null; // Ensure we don't calculate time when paused
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
        
        // Derive total court time from the new position times
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
                updatePlayerTimes(); // Final update
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
        updatePlayerTimes(); // Update on pause
        lastUpdateTime.current = null;
      }
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive, updatePlayerTimes]);


  const isLoading = isUserLoading || isMatchLoading || arePlayersLoading || isGameFormatLoading || arePositionsLoading;

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  };

  const toggleTimer = () => {
    setIsActive(!isActive);
  };

  const resetTimer = () => {
    setIsActive(false);
    setTime(gameFormat?.periodDuration * 60 || 0);
  };
  
  const advancePeriod = () => {
    if (!gameFormat || currentPeriod >= gameFormat.numberOfPeriods) return;

    if (isActive) {
      setIsActive(false); // Pause timer, which triggers a final time update
    }

    const timeRemaining = time;

    if (timeRemaining > 0) {
      // Create new state objects based on the current state
      setPlayerTimeInPosition(currentPosTimes => {
          const newPosTimes = JSON.parse(JSON.stringify(currentPosTimes));
          Object.entries(courtPositions).forEach(([posAbbr, playerId]) => {
              if (playerId) {
                  if (!newPosTimes[playerId]) newPosTimes[playerId] = {};
                  newPosTimes[playerId][posAbbr] = (newPosTimes[playerId][posAbbr] || 0) + timeRemaining;
              }
          });

          // Derive total court time from the newly updated position times
          setPlayerTimeOnCourt(currentCourtTimes => {
              const newCourtTimes = { ...currentCourtTimes };
              Object.keys(newPosTimes).forEach(playerId => {
                  newCourtTimes[playerId] = Object.values(newPosTimes[playerId]).reduce((sum: number, time: any) => sum + time, 0);
              });
              return newCourtTimes;
          });

          return newPosTimes;
      });
    }

    // Advance to the next period
    setCurrentPeriod(prev => prev + 1);
    setTime(gameFormat.periodDuration * 60);
    lastUpdateTime.current = null; // Reset for the new period
  };

  const handleDragStart = (e: DragEvent<HTMLDivElement>, playerId: string) => {
    e.dataTransfer.setData("playerId", playerId);
  };

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
        if (oldPosOfDraggedPlayer) {
            newPositions[oldPosOfDraggedPlayer] = null;
        }
        return newPositions;
    });
  };

  const allowDrop = (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
  };


  const benchedPlayers = players?.filter(p => !onCourtPlayerIds.includes(p.id)) || [];

  const PlayerCard = ({ player }: { player: any }) => {
    const totalTime = playerTimeOnCourt[player.id] || 0;
    const positionTimes = playerTimeInPosition[player.id] || {};

    return (
        <div
            draggable
            onDragStart={(e) => handleDragStart(e, player.id)}
            className="p-3 rounded-lg bg-card border shadow-sm cursor-grab active:cursor-grabbing"
        >
            <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-card-foreground">{player.name}</span>
                <Badge variant="secondary" className="font-mono text-xs">{formatTime(totalTime)}</Badge>
            </div>
            <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {positions && Object.entries(positionTimes).map(([posAbbr, timeInPos]) => {
                    const time = timeInPos || 0;
                    return time > 0 ? (
                        <div key={posAbbr} className="flex items-center gap-1">
                            <span className="font-semibold">{posAbbr}:</span>
                            <span className="font-mono">{formatTime(time)}</span>
                        </div>
                    ) : null;
                })}
            </div>
        </div>
    );
};


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

  if (!match) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-xl">
        <Alert variant="destructive">
          <AlertTitle>Match Not Found</AlertTitle>
          <AlertDescription>The match you are looking for could not be found.</AlertDescription>
        </Alert>
      </div>
    );
  }


  return (
    <div className="container mx-auto py-8 px-4">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold font-headline">Live Game</h1>
        <p className="text-muted-foreground">Tracking court time for <span className='font-bold text-primary'>{match.name || `vs ${match.opponent}`}</span>.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
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
                <Button size="sm" variant="ghost" onClick={resetTimer}>
                    <RefreshCw className="h-4 w-4" />
                </Button>
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
                                className={cn(
                                    "p-4 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 min-h-[100px]",
                                    player ? "border-primary bg-primary/10" : "border-muted-foreground/50 bg-background/30"
                                )}
                            >
                                <div className="flex items-center gap-2">
                                  <Icon className="h-5 w-5 text-primary" />
                                  <span className="font-bold text-primary">{position.abbreviation}</span>
                                </div>
                                {player ? (
                                    <PlayerCard
                                      player={player}
                                    />
                                ) : (
                                    <span className="text-xs text-muted-foreground">Empty</span>
                                )}
                            </div>
                        )
                    })}
                </CardContent>
            </Card>
        </div>

        <div className="lg:col-span-1">
            <Card
                className="min-h-[400px]"
                onDrop={handleBenchDrop}
                onDragOver={allowDrop}
            >
                <CardHeader>
                    <CardTitle>Bench ({benchedPlayers.length})</CardTitle>
                    <CardDescription>Drag players from here onto the court.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {benchedPlayers.map(player => (
                        <PlayerCard
                          key={player.id}
                          player={player}
                        />
                    ))}
                    {benchedPlayers.length === 0 && <p className="text-sm text-center text-muted-foreground pt-10">No players on the bench</p>}
                </CardContent>
            </Card>
        </div>
    </div>

    </div>
  );
}
