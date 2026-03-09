'use client';

import { useRouter } from 'next/navigation';
import { useFirebase } from '@/firebase';
import { useMatches } from '@/api/hooks/use-matches';
import { useTournament } from '@/api/hooks/use-tournaments';
import { useRoster } from '@/api/hooks/use-rosters';
import { useGameFormats, useGameFormat } from '@/api/hooks/use-game-formats';
import { apiJSON } from '@/api/client';
import { normalizeMatchPlan } from '@/api/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PlusCircle, BarChart2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, useEffect } from 'react';
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
    const { getIdToken } = useFirebase();
    const tournamentId = getNavId('tournamentId');

    const { data: tournament, isLoading: isTournamentLoading } = useTournament(tournamentId);
    const { data: allMatches, isLoading: areMatchesLoading } = useMatches();

    const matches = useMemo(() =>
        allMatches && tournament?.matchIds
            ? allMatches.filter(m => tournament.matchIds.includes(m.id))
            : [],
        [allMatches, tournament]
    );

    const rosterIds = useMemo(() =>
        [...new Set(matches.map(m => m.team1RosterId).filter(Boolean))] as string[],
        [matches]
    );
    const gameFormatIds = useMemo(() =>
        [...new Set(matches.map(m => m.gameFormatId).filter(Boolean))] as string[],
        [matches]
    );

    const { data: roster, isLoading: isRosterLoading } = useRoster(rosterIds[0] ?? null);
    const { data: primaryGameFormat, isLoading: isFormatLoading } = useGameFormat(gameFormatIds[0] ?? null);
    const { data: allGameFormats, isLoading: areAllFormatsLoading } = useGameFormats();

    const players = roster?.players ?? [];
    const positions = primaryGameFormat?.positions ?? [];

    const gameFormats = useMemo(() =>
        allGameFormats?.filter(f => gameFormatIds.includes(f.id)) ?? [],
        [allGameFormats, gameFormatIds]
    );

    const [allMatchPlans, setAllMatchPlans] = useState<any[]>([]);
    const [arePlansLoading, setArePlansLoading] = useState(false);

    useEffect(() => {
        if (matches.length === 0) return;
        setArePlansLoading(true);
        Promise.all(matches.map(m => apiJSON<any[]>(`/api/matches/${m.id}/plans`, getIdToken)))
            .then(results => setAllMatchPlans(results.flat().map(normalizeMatchPlan)))
            .catch(() => setAllMatchPlans([]))
            .finally(() => setArePlansLoading(false));
    }, [matches, getIdToken]);

    const tournamentTimeTotals = useMemo(() => {
        if (!players.length || !matches.length || !allGameFormats) return {};

        const tournamentTotals: MatchTimeCalculations = players.reduce((acc: any, p: any) => ({ ...acc, [p.id]: { total: 0, positions: {} } }), {});

        matches.forEach((match: any) => {
            const gameFormat = allGameFormats.find(f => f.id === match.gameFormatId);
            const matchTimes = calculateMatchTimes(match, gameFormat, allMatchPlans, players);
            Object.entries(matchTimes).forEach(([playerId, timeInfo]) => {
                if (tournamentTotals[playerId]) {
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

    }, [players, matches, allGameFormats, allMatchPlans]);

    const handleAddMatch = () => {
        router.push('/tournaments/add-match');
    };

    const handleEditPlan = (matchId: string) => {
        setNavId('gameId', matchId);
        router.push('/games/play?mode=plan');
    };

    const isLoading = isTournamentLoading || areMatchesLoading || isRosterLoading || isFormatLoading || areAllFormatsLoading || arePlansLoading;

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
                                {positions.map((p: any) => <TableHead key={p.id} className="text-right">{p.abbreviation}</TableHead>)}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {players.map((player: any) => (
                                <TableRow key={player.id}>
                                    <TableCell className="font-medium">{player.name}</TableCell>
                                    <TableCell className="text-right font-mono">{formatTime(tournamentTimeTotals[player.id]?.total || 0)}</TableCell>
                                    {positions.map((p: any) => (
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
                {matches.map((match: any) => {
                     const gameFormat = allGameFormats?.find(f => f.id === match.gameFormatId);
                     const matchTimes = calculateMatchTimes(match, gameFormat, allMatchPlans, players);
                    return (
                        <Card key={match.id}>
                            <CardHeader>
                                <CardTitle>{match.name}</CardTitle>
                                <CardDescription>Roster: {roster?.name || '...'} | Format: {gameFormat?.name || '...'}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Player</TableHead>
                                            <TableHead className="text-right">Total Time</TableHead>
                                            {positions.map((p: any) => <TableHead key={p.id} className="text-right">{p.abbreviation}</TableHead>)}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                         {players.map((player: any) => (
                                            <TableRow key={player.id}>
                                                <TableCell className="font-medium">{player.name}</TableCell>
                                                <TableCell className="text-right font-mono">{formatTime(matchTimes[player.id]?.total || 0)}</TableCell>
                                                {positions.map((p: any) => (
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
                 {matches.length === 0 && (
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
