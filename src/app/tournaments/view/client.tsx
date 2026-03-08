'use client';

import { useRouter } from 'next/navigation';
import { useDoc, useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import { doc, collection, query, where, documentId } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Trophy, PlusCircle, BarChart2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { getNavId, setNavId } from '@/lib/nav';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PlayerTimeInfo = { total: number; positions: Record<string, number> };
type MatchTimeCalculations = Record<string, PlayerTimeInfo>;

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}m`;

function calculateMatchTimes(match: any, gameFormat: any, matchPlans: any[], players: any[]): MatchTimeCalculations {
    if (!gameFormat || !players || !matchPlans) return {};

    const periodDuration = gameFormat.periodDuration * 60;
    const playerTimes: MatchTimeCalculations = players.reduce((acc, p) => ({
      ...acc,
      [p.id]: { total: 0, positions: {} },
    }), {});

    matchPlans.filter(mp => mp.matchId === match.id).forEach(plan => {
      plan.playerPositions.forEach((pos: { playerId: string; position: string }) => {
        if (playerTimes[pos.playerId]) {
          playerTimes[pos.playerId].total += periodDuration;
          if (!playerTimes[pos.playerId].positions[pos.position]) {
            playerTimes[pos.playerId].positions[pos.position] = 0;
          }
          playerTimes[pos.playerId].positions[pos.position] += periodDuration;
        }
      });
    });

    return playerTimes;
}


export default function TournamentViewPage() {
    const router = useRouter();
    const tournamentId = getNavId('tournamentId');
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();

    const tournamentRef = useMemoFirebase(() => {
        if (!user || !tournamentId) return null;
        return doc(firestore, 'users', user.uid, 'tournaments', tournamentId);
    }, [firestore, user, tournamentId]);
    const { data: tournament, isLoading: isTournamentLoading } = useDoc(tournamentRef);

    const matchesQuery = useMemoFirebase(() => {
        if (!user || !tournament?.matchIds || tournament.matchIds.length === 0) return null;
        return query(collection(firestore, 'users', user.uid, 'matches'), where(documentId(), 'in', tournament.matchIds));
    }, [firestore, user, tournament]);
    const { data: matches, isLoading: areMatchesLoading } = useCollection(matchesQuery);

    const rosterIds = useMemo(() => matches ? [...new Set(matches.map((m: any) => m.team1RosterId))] : [], [matches]);

    const playersQuery = useMemoFirebase(() => {
        if (!user || rosterIds.length === 0) return null;
        return collection(firestore, `users/${user.uid}/rosters/${rosterIds[0]}/players`);
    }, [firestore, user, rosterIds]);
    const { data: players, isLoading: arePlayersLoading } = useCollection(playersQuery);

    const matchPlanQuery = useMemoFirebase(() => {
        if (!user || !matches) return null;
        const matchIds = matches.map((m: any) => m.id);
        if (matchIds.length === 0) return null;
        return query(collection(firestore, `users/${user.uid}/matches`));
    }, [firestore, user, matches]);

    const { data: allMatchesWithPlans, isLoading: arePlansLoading } = useCollection(matchPlanQuery);

    const allMatchPlans = useMemo(() => {
        if (!allMatchesWithPlans || !matches) return [];
        const matchIds = matches.map((m: any) => m.id);
        let plans: any[] = [];
        allMatchesWithPlans.forEach((m: any) => {
            if (m.matchPlans && matchIds.includes(m.id)) {
                plans = [...plans, ...m.matchPlans];
            }
        });
        return plans;
    }, [allMatchesWithPlans, matches]);

    const gameFormatIds = useMemo(() => matches ? [...new Set(matches.map((m: any) => m.gameFormatId))] : [], [matches]);
    const gameFormatsQuery = useMemoFirebase(() => {
        if (!user || gameFormatIds.length === 0) return null;
        return query(collection(firestore, 'users', user.uid, 'gameFormats'), where(documentId(), 'in', gameFormatIds));
    }, [firestore, user, gameFormatIds]);
    const { data: gameFormats, isLoading: areFormatsLoading } = useCollection(gameFormatsQuery);

    const allPositionsQuery = useMemoFirebase(() => {
        if (!user || gameFormatIds.length === 0) return null;
        return collection(firestore, `users/${user.uid}/gameFormats/${gameFormatIds[0]}/positions`);
    }, [firestore, user, gameFormatIds]);
    const { data: positions, isLoading: arePositionsLoading } = useCollection(allPositionsQuery);

    const tournamentTimeTotals = useMemo(() => {
        if (!players || !matches || !gameFormats || !allMatchPlans) return {};

        const tournamentTotals: MatchTimeCalculations = players.reduce((acc: any, p: any) => ({ ...acc, [p.id]: { total: 0, positions: {} } }), {});

        matches.forEach((match: any) => {
            const gameFormat = gameFormats.find((f: any) => f.id === match.gameFormatId);
            const matchTimes = calculateMatchTimes(match, gameFormat, allMatchPlans, players);
            Object.entries(matchTimes).forEach(([playerId, timeInfo]) => {
                if(tournamentTotals[playerId]) {
                    tournamentTotals[playerId].total += timeInfo.total;
                    Object.entries(timeInfo.positions).forEach(([pos, time]) => {
                         if (!tournamentTotals[playerId].positions[pos]) {
                            tournamentTotals[playerId].positions[pos] = 0;
                        }
                        tournamentTotals[playerId].positions[pos] += time;
                    });
                }
            });
        });
        return tournamentTotals;

    }, [players, matches, gameFormats, allMatchPlans]);

    const handleAddMatch = () => {
        // tournamentId is already in localStorage from when we navigated here
        router.push('/tournaments/add-match');
    };

    const handleEditPlan = (matchId: string) => {
        setNavId('gameId', matchId);
        router.push('/games/play?mode=plan');
    };

    const isLoading = isUserLoading || isTournamentLoading || areMatchesLoading || arePlayersLoading || arePlansLoading || areFormatsLoading || arePositionsLoading;

    if (isLoading) {
        return (
             <div className="container mx-auto py-8 px-4 space-y-8">
                <Skeleton className="h-10 w-1/2" />
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    if (!tournamentId) {
        return (
             <div className="container mx-auto py-8 px-4 max-w-xl">
                <Alert variant="destructive">
                    <AlertTitle>No Tournament Selected</AlertTitle>
                    <AlertDescription>Please select a tournament from the Tournaments page.</AlertDescription>
                </Alert>
                <Button asChild variant="link" className="mt-4">
                    <Link href="/tournaments">Back to Tournaments</Link>
                </Button>
            </div>
        );
    }

    if (!tournament) {
        return (
             <div className="container mx-auto py-8 px-4 max-w-xl">
                <Alert variant="destructive">
                    <AlertTitle>Tournament Not Found</AlertTitle>
                </Alert>
                <Button asChild variant="link" className="mt-4">
                    <Link href="/tournaments">Back to Tournaments</Link>
                </Button>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-8 px-4">
            <div className="flex justify-between items-center mb-6">
                <div>
                <h1 className="text-3xl font-bold font-headline">{tournament.name}</h1>
                <p className="text-muted-foreground">Review stats for this tournament.</p>
                </div>
                <Button onClick={handleAddMatch}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add Match
                </Button>
            </div>

            <Card className="mb-8">
                <CardHeader>
                    <CardTitle>Tournament Summary</CardTitle>
                    <CardDescription>Cumulative player court time across all games in the tournament.</CardDescription>
                </CardHeader>
                <CardContent>
                     <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Player</TableHead>
                                <TableHead className="text-right">Total Time</TableHead>
                                {positions?.map((p: any) => <TableHead key={p.id} className="text-right">{p.abbreviation}</TableHead>)}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {players?.map((player: any) => (
                                <TableRow key={player.id}>
                                    <TableCell className="font-medium">{player.name}</TableCell>
                                    <TableCell className="text-right font-mono">{formatTime(tournamentTimeTotals[player.id]?.total || 0)}</TableCell>
                                    {positions?.map((p: any) => (
                                         <TableCell key={p.id} className="text-right font-mono">{formatTime(tournamentTimeTotals[player.id]?.positions[p.abbreviation] || 0)}</TableCell>
                                    ))}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <div className="space-y-6">
                <h2 className="text-2xl font-bold font-headline">Games in this Tournament</h2>
                {matches?.map((match: any) => {
                     const gameFormat = gameFormats?.find((f: any) => f.id === match.gameFormatId);
                     const matchTimes = calculateMatchTimes(match, gameFormat, allMatchPlans, players ?? []);
                    return (
                        <Card key={match.id}>
                            <CardHeader>
                                <CardTitle>{match.name}</CardTitle>
                                <CardDescription>Roster: {players?.[0]?.rosterName || '...'} | Format: {gameFormat?.name || '...'}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Player</TableHead>
                                            <TableHead className="text-right">Total Time</TableHead>
                                            {positions?.map((p: any) => <TableHead key={p.id} className="text-right">{p.abbreviation}</TableHead>)}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                         {players?.map((player: any) => (
                                            <TableRow key={player.id}>
                                                <TableCell className="font-medium">{player.name}</TableCell>
                                                <TableCell className="text-right font-mono">{formatTime(matchTimes[player.id]?.total || 0)}</TableCell>
                                                {positions?.map((p: any) => (
                                                    <TableCell key={p.id} className="text-right font-mono">{formatTime(matchTimes[player.id]?.positions[p.abbreviation] || 0)}</TableCell>
                                                ))}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                             <CardFooter>
                                <Button variant="outline" onClick={() => handleEditPlan(match.id)}>
                                    Edit Plan
                                </Button>
                            </CardFooter>
                        </Card>
                    );
                })}
                 {(!matches || matches.length === 0) && (
                    <div className="text-center py-10 border-2 border-dashed rounded-lg">
                        <BarChart2 className="mx-auto h-12 w-12 text-muted-foreground" />
                        <h3 className="mt-4 text-lg font-medium">No Games Added Yet</h3>
                        <p className="mt-1 text-sm text-muted-foreground">Add your first match to start tracking tournament stats.</p>
                        <Button className="mt-4" onClick={handleAddMatch}>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Add First Match
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
