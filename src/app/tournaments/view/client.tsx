'use client';

import { useRouter } from 'next/navigation';
import { useFirebase } from '@/firebase';
import { useMatches } from '@/api/hooks/use-matches';
import { useTournament } from '@/api/hooks/use-tournaments';
import { useRoster } from '@/api/hooks/use-rosters';
import { useGameFormats, useGameFormat } from '@/api/hooks/use-game-formats';
import { useMatchPlansMultiple } from '@/api/hooks/use-match-plans-multiple';
import { apiJSON } from '@/api/client';
import { normalizeSubEvent } from '@/api/types';
import { calculatePlayerTimes } from '@/lib/time-calculations';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PlusCircle, BarChart2, Trash2, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, useEffect, useCallback } from 'react';
import { getNavId, setNavId } from '@/lib/nav';
import { useToast } from '@/hooks/use-toast';
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

function courtTimeColor(value: number, min: number, max: number): string {
  if (max === min) return 'inherit'
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)))
  const hue = t < 0.5 ? t * 2 * 45 : 45 + (t - 0.5) * 2 * 75
  const sat = t < 0.5 ? 85 : 70
  return `hsl(${Math.round(hue)}, ${sat}%, 40%)`
}

export default function TournamentViewPage() {
    const router = useRouter();
    const { toast } = useToast();
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
    const { data: allMatchPlans, isLoading: arePlansLoading } = useMatchPlansMultiple(tournament?.matchIds ?? []);

    const players = roster?.players ?? [];
    const positions = primaryGameFormat?.positions ?? [];

    const [allSubEvents, setAllSubEvents] = useState<any[]>([]);
    const [areSubEventsLoading, setAreSubEventsLoading] = useState(false);

    useEffect(() => {
        if (matches.length === 0) return;
        setAreSubEventsLoading(true);
        Promise.all(matches.map(m => apiJSON<any[]>(`/api/matches/${m.id}/sub-events`, getIdToken)))
            .then(results => setAllSubEvents(results.flat().map(normalizeSubEvent)))
            .catch(() => setAllSubEvents([]))
            .finally(() => setAreSubEventsLoading(false));
    }, [matches, getIdToken]);

    const tournamentTimeTotals = useMemo(() => {
        if (!players.length || !matches.length || !allGameFormats) return {};

        const tournamentTotals: MatchTimeCalculations = players.reduce((acc: any, p: any) => ({ ...acc, [p.id]: { total: 0, positions: {} } }), {});

        matches.forEach((match: any) => {
            const gameFormat = allGameFormats.find(f => f.id === match.gameFormatId);
            if (!gameFormat) return;
            const matchSubEvents = allSubEvents.filter(e => e.matchId === match.id);
            const matchTimes = calculatePlayerTimes(matchSubEvents, gameFormat.periodDuration * 60);
            Object.entries(matchTimes).forEach(([playerId, timeInfo]) => {
                if (tournamentTotals[playerId]) {
                    tournamentTotals[playerId].total += timeInfo.total;
                    Object.entries(timeInfo.positions).forEach(([pos, time]) => {
                        if (!tournamentTotals[playerId].positions[pos]) {
                            tournamentTotals[playerId].positions[pos] = 0;
                        }
                        tournamentTotals[playerId].positions[pos] += time as number;
                    });
                }
            });
        });
        return tournamentTotals;

    }, [players, matches, allGameFormats, allSubEvents]);

    // Total periods on court per player across all tournament match plans
    const planPeriodCounts = useMemo(() => {
      if (!allMatchPlans) return {} as Record<string, number>
      const counts: Record<string, number> = {}
      for (const plan of allMatchPlans) {
        for (const pp of plan.playerPositions) {
          counts[pp.playerId] = (counts[pp.playerId] ?? 0) + 1
        }
      }
      return counts
    }, [allMatchPlans])

    // Periods on court per player per match, keyed by matchId then playerId
    const planPeriodsByMatch = useMemo(() => {
      if (!allMatchPlans) return {} as Record<string, Record<string, number>>
      const result: Record<string, Record<string, number>> = {}
      for (const plan of allMatchPlans) {
        if (!result[plan.matchId]) result[plan.matchId] = {}
        for (const pp of plan.playerPositions) {
          result[plan.matchId][pp.playerId] = (result[plan.matchId][pp.playerId] ?? 0) + 1
        }
      }
      return result
    }, [allMatchPlans])

    // Periods per player per position across all tournament match plans
    const planPositionCounts = useMemo(() => {
      if (!allMatchPlans) return {} as Record<string, Record<string, number>>
      const counts: Record<string, Record<string, number>> = {}
      for (const plan of allMatchPlans) {
        for (const pp of plan.playerPositions) {
          if (!counts[pp.playerId]) counts[pp.playerId] = {}
          counts[pp.playerId][pp.position] = (counts[pp.playerId][pp.position] ?? 0) + 1
        }
      }
      return counts
    }, [allMatchPlans])

    // Per-period position grid: matchId → period → playerId → posAbbr
    const planGridByMatch = useMemo(() => {
      if (!allMatchPlans) return {} as Record<string, Record<number, Record<string, string>>>
      const result: Record<string, Record<number, Record<string, string>>> = {}
      for (const plan of allMatchPlans) {
        if (!result[plan.matchId]) result[plan.matchId] = {}
        if (!result[plan.matchId][plan.quarter]) result[plan.matchId][plan.quarter] = {}
        for (const pp of plan.playerPositions) {
          result[plan.matchId][plan.quarter][pp.playerId] = pp.position
        }
      }
      return result
    }, [allMatchPlans])

    // Periods per player per position, broken down per match
    const planPositionsByMatch = useMemo(() => {
      if (!allMatchPlans) return {} as Record<string, Record<string, Record<string, number>>>
      const result: Record<string, Record<string, Record<string, number>>> = {}
      for (const plan of allMatchPlans) {
        if (!result[plan.matchId]) result[plan.matchId] = {}
        for (const pp of plan.playerPositions) {
          if (!result[plan.matchId][pp.playerId]) result[plan.matchId][pp.playerId] = {}
          result[plan.matchId][pp.playerId][pp.position] = (result[plan.matchId][pp.playerId][pp.position] ?? 0) + 1
        }
      }
      return result
    }, [allMatchPlans])

    const handleAddMatch = () => {
        router.push('/tournaments/add-match');
    };

    const handleEditPlan = (matchId: string) => {
        setNavId('gameId', matchId);
        router.push('/games/play?mode=plan');
    };

    const [viewPlanMatchId, setViewPlanMatchId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = useCallback(async () => {
        if (!tournament) return;
        if (!window.confirm(`Delete "${tournament.name}" and all its games? This cannot be undone.`)) return;
        setIsDeleting(true);
        try {
            await apiJSON(`/api/tournaments/${tournament.id}`, getIdToken, { method: 'DELETE' });
            router.push('/tournaments');
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Delete failed', description: error.message });
            setIsDeleting(false);
        }
    }, [tournament, getIdToken, router, toast]);

    const isLoading = isTournamentLoading || areMatchesLoading || isRosterLoading || isFormatLoading || areAllFormatsLoading || areSubEventsLoading || arePlansLoading;

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
                <div className="flex gap-2">
                    <Button onClick={handleAddMatch}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add Match
                    </Button>
                    <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        {isDeleting ? 'Deleting…' : 'Delete'}
                    </Button>
                </div>
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
                                <TableHead className="text-right">Court Time</TableHead>
                                {positions.map((p: any) => <TableHead key={p.id} className="text-right">{p.abbreviation}</TableHead>)}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(() => {
                            const summaryPeriodSecs = (primaryGameFormat?.periodDuration ?? 0) * 60
                            const planValues = players.map((p: any) => planPeriodCounts[p.id] ?? 0)
                            const planMin = planValues.length ? Math.min(...planValues) : 0
                            const planMax = planValues.length ? Math.max(...planValues) : 0
                            return players.map((player: any) => {
                              const actualTime = tournamentTimeTotals[player.id]?.total || 0
                              const planned = planPeriodCounts[player.id] ?? 0
                              const display = actualTime > 0 ? formatTime(actualTime) : planned > 0 && summaryPeriodSecs > 0 ? formatTime(planned * summaryPeriodSecs) : '—'
                              return (
                              <TableRow key={player.id}>
                                <TableCell className="font-medium">{player.name}</TableCell>
                                <TableCell
                                  className="text-right font-mono font-semibold"
                                  style={{ color: courtTimeColor(planPeriodCounts[player.id] ?? 0, planMin, planMax) }}
                                >
                                  {display}
                                </TableCell>
                                {positions.map((p: any) => {
                                  const actualPosTime = tournamentTimeTotals[player.id]?.positions[p.abbreviation] || 0
                                  const plannedPos = planPositionCounts[player.id]?.[p.abbreviation] ?? 0
                                  const posDisplay = actualPosTime > 0 ? formatTime(actualPosTime) : plannedPos > 0 && summaryPeriodSecs > 0 ? formatTime(plannedPos * summaryPeriodSecs) : '—'
                                  return (
                                    <TableCell key={p.id} className="text-right font-mono">
                                      {posDisplay}
                                    </TableCell>
                                  )
                                })}
                              </TableRow>
                            )})
                          })()}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <div className="space-y-6">
                <h2 className="text-2xl font-bold font-headline">Games in this Tournament</h2>
                {matches.map((match: any) => {
                     const gameFormat = allGameFormats?.find(f => f.id === match.gameFormatId);
                     const matchSubEvents = allSubEvents.filter(e => e.matchId === match.id);
                     const matchTimes = gameFormat
                        ? calculatePlayerTimes(matchSubEvents, gameFormat.periodDuration * 60)
                        : {};
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
                                            <TableHead className="text-right">Court Time</TableHead>
                                            {positions.map((p: any) => <TableHead key={p.id} className="text-right">{p.abbreviation}</TableHead>)}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {(() => {
                                        const matchPeriodSecs = (gameFormat?.periodDuration ?? 0) * 60
                                        const matchPlanValues = players.map((p: any) => planPeriodsByMatch[match.id]?.[p.id] ?? 0)
                                        const matchPlanMin = matchPlanValues.length ? Math.min(...matchPlanValues) : 0
                                        const matchPlanMax = matchPlanValues.length ? Math.max(...matchPlanValues) : 0
                                        return players.map((player: any) => {
                                          const actualTime = matchTimes[player.id]?.total || 0
                                          const planned = planPeriodsByMatch[match.id]?.[player.id] ?? 0
                                          const display = actualTime > 0 ? formatTime(actualTime) : planned > 0 && matchPeriodSecs > 0 ? formatTime(planned * matchPeriodSecs) : '—'
                                          return (
                                          <TableRow key={player.id}>
                                            <TableCell className="font-medium">{player.name}</TableCell>
                                            <TableCell
                                              className="text-right font-mono font-semibold"
                                              style={{ color: courtTimeColor(planned, matchPlanMin, matchPlanMax) }}
                                            >
                                              {display}
                                            </TableCell>
                                            {positions.map((p: any) => {
                                              const actualPosTime = matchTimes[player.id]?.positions[p.abbreviation] || 0
                                              const plannedPos = planPositionsByMatch[match.id]?.[player.id]?.[p.abbreviation] ?? 0
                                              const posDisplay = actualPosTime > 0 ? formatTime(actualPosTime) : plannedPos > 0 && matchPeriodSecs > 0 ? formatTime(plannedPos * matchPeriodSecs) : '—'
                                              return (
                                                <TableCell key={p.id} className="text-right font-mono">
                                                  {posDisplay}
                                                </TableCell>
                                              )
                                            })}
                                          </TableRow>
                                        )})
                                      })()}
                                    </TableBody>
                                </Table>
                                {viewPlanMatchId === match.id && (() => {
                                    const periods = Array.from(
                                        { length: gameFormat?.numberOfPeriods ?? 4 },
                                        (_, i) => i + 1
                                    )
                                    const grid = planGridByMatch[match.id] ?? {}
                                    return (
                                        <div className="mt-4 border-t pt-4">
                                            <h4 className="text-sm font-semibold mb-2 text-muted-foreground">Period-by-period plan</h4>
                                            <div className="overflow-x-auto">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Player</TableHead>
                                                            {periods.map(q => (
                                                                <TableHead key={q} className="text-center">Q{q}</TableHead>
                                                            ))}
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {players.map((player: any) => (
                                                            <TableRow key={player.id}>
                                                                <TableCell className="font-medium">{player.name}</TableCell>
                                                                {periods.map(q => {
                                                                    const pos = grid[q]?.[player.id]
                                                                    return (
                                                                        <TableCell key={q} className="text-center font-mono">
                                                                            {pos ?? <span className="text-muted-foreground">—</span>}
                                                                        </TableCell>
                                                                    )
                                                                })}
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        </div>
                                    )
                                })()}
                            </CardContent>
                             <CardFooter className="gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setViewPlanMatchId(v => v === match.id ? null : match.id)}
                                >
                                    {viewPlanMatchId === match.id
                                        ? <><EyeOff className="mr-2 h-4 w-4" />Hide Plan</>
                                        : <><Eye className="mr-2 h-4 w-4" />View Plan</>
                                    }
                                </Button>
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
