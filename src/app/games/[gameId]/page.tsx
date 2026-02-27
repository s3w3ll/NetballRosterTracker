'use client';

import { useParams } from 'next/navigation';
import { useDoc, useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import { doc, collection } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Timer, Users, User, Shield, Target, Circle, Feather, Footprints } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState, useEffect } from 'react';
import { type LucideIcon } from 'lucide-react';

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
  
  useEffect(() => {
      if (positions) {
          setCourtPositions(
            positions.reduce((acc, pos) => ({ ...acc, [pos.abbreviation]: null }), {})
          );
      }
  }, [positions])


  const isLoading = isUserLoading || isMatchLoading || arePlayersLoading || isGameFormatLoading || arePositionsLoading;

  const handlePositionChange = (position: string, playerId: string) => {
    setCourtPositions(prev => ({
      ...prev,
      [position]: playerId,
    }));
  };

  const onCourtPlayerIds = Object.values(courtPositions).filter(Boolean) as string[];
  const benchedPlayers = players?.filter(p => !onCourtPlayerIds.includes(p.id)) || [];

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
        <p className="text-muted-foreground">Tracking court time and substitutions.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Current Period</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Period 1 / {gameFormat?.numberOfPeriods}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Game Clock</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">00:00</div>
            <p className="text-xs text-muted-foreground">out of {gameFormat?.periodDuration} minutes</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Players</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{players?.length || 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>On The Court ({onCourtPlayerIds.length})</CardTitle>
            <CardDescription>Assign players to their positions for the current period.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {positions && positions.map(position => {
              const Icon = iconMap[position.icon] || User;
              const selectedPlayerId = courtPositions[position.abbreviation];
              return (
                 <div key={position.abbreviation} className="flex items-center gap-4">
                    <div className='flex items-center gap-2 w-20'>
                        <Icon className="h-5 w-5 text-primary" />
                        <span className="font-semibold text-sm">{position.abbreviation}</span>
                    </div>
                    <Select onValueChange={(playerId) => handlePositionChange(position.abbreviation, playerId)} value={selectedPlayerId || undefined}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select a player..." />
                        </SelectTrigger>
                        <SelectContent>
                            {players?.map(player => (
                                <SelectItem key={player.id} value={player.id} disabled={onCourtPlayerIds.includes(player.id) && selectedPlayerId !== player.id}>
                                    {player.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
              )
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>On The Bench ({benchedPlayers.length})</CardTitle>
            <CardDescription>Players available for substitution.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
             {benchedPlayers.map(player => (
              <div key={player.id} className="flex items-center gap-3 p-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <Users className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                <span className="font-medium text-sm">{player.name}</span>
              </div>
            ))}
            {benchedPlayers.length === 0 && <p className="text-sm text-muted-foreground text-center pt-4">No players on the bench.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
