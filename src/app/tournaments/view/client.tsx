'use client';

import { useRouter } from 'next/navigation';
import { useFirebase } from '@/firebase';
import { useMatches } from '@/api/hooks/use-matches';
import { useTournament } from '@/api/hooks/use-tournaments';
import { useRoster } from '@/api/hooks/use-rosters';
import { useGameFormats, useGameFormat } from '@/api/hooks/use-game-formats';
import { apiJSON } from '@/api/client';
import { normalizeSubEvent, type SubEvent } from '@/api/types';
import { calculatePlayerTimes, projectedEvents, playedPeriods } from '@/lib/time-calculations';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PlusCircle, BarChart2, Trash2, Eye, EyeOff, RefreshCw } from 'lucide-react';
import ReplanDialog from '@/components/shared/ReplanDialog';
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

    const players = roster?.players ?? [];
    const positions = primaryGameFormat?.positions ?? [];

    const [allSubEvents, setAllSubEvents] = useState<SubEvent[]>([]);
    const [areSubEventsLoading, setAreSubEventsLoading] = useState(false);
    const [subEventsVersion, setSubEventsVersion] = useState(0);
    const [isReplanOpen, setIsReplanOpen] = useState(false);

    useEffect(() => {
        if (matches.length === 0) return;
        setAreSubEventsLoading(true);
        Promise.all(matches.map(m => apiJSON<any[]>(`/api/matches/${m.id}/sub-events`, getIdToken)))
            .then(results => setAllSubEvents(results.flat().map(normalizeSubEvent)))
            .catch(() => setAllSubEvents([]))
            .finally(() => setAreSubEventsLoading(false));
    }, [matches, getIdToken, subEventsVersion]);

    // Per match: actual (live) time for quarters that have been played, planned time for the rest.
    const matchProjections = useMemo(() => {
        const result: Record<string, { times: MatchTimeCalculations; played: number[] }> = {}
        if (!allGameFormats) return result
        for (const match of matches) {
            const gameFormat = allGameFormats.find(f => f.id === match.gameFormatId)
            if (!gameFormat) continue
            const matchEvents = allSubEvents.filter(e => e.matchId === match.id)
            result[match.id] = {
                times: calculatePlayerTimes(projectedEvents(matchEvents), gameFormat.periodDuration * 60),
                played: playedPeriods(matchEvents),
            }
        }
        return result
    }, [matches, allGameFormats, allSubEvents])

    const summaryTotals = useMemo(() => {
        const totals: MatchTimeCalculations = players.reduce((acc: any, p: any) => ({ ...acc, [p.id]: { total: 0, positions: {} } }), {})
        for (const { times } of Object.values(matchProjections)) {
            for (const [playerId, timeInfo] of Object.entries(times)) {
                if (!totals[playerId]) continue
                totals[playerId].total += timeInfo.total
                for (const [pos, secs] of Object.entries(timeInfo.positions)) {
                    totals[playerId].positions[pos] = (totals[playerId].positions[pos] ?? 0) + secs
                }
            }
        }
        return totals
    }, [players, matchProjections])

    // Planned starting lineups: matchId → period → playerId → posAbbr
    const planGridByMatch = useMemo(() => {
      const result: Record<string, Record<number, Record<string, string>>> = {}
      for (const e of allSubEvents) {
        if (e.kind !== 'plan' || e.secondsElapsed !== 0 || !e.positionAbbr) continue
        result[e.matchId] ??= {}
        result[e.matchId][e.period] ??= {}
        result[e.matchId][e.period][e.playerId] = e.positionAbbr
      }
      return result
    }, [allSubEvents])

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

    const isLoading = isTournamentLoading || areMatchesLoading || isRosterLoading || isFormatLoading || areAllFormatsLoading || areSubEventsLoading;

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
                    <Button variant="outline" onClick={() => setIsReplanOpen(true)} disabled={matches.length === 0}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Replan
                    </Button>
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

            <ReplanDialog
                tournamentId={tournament.id}
                open={isReplanOpen}
                onOpenChange={setIsReplanOpen}
                onApplied={() => setSubEventsVersion(v => v + 1)}
            />

            <Card className="mb-8">
                <CardHeader>
                    <CardTitle>Tournament Summary</CardTitle>
                    <CardDescription>Court time across all games: actual time for quarters already played, planned time for the rest.</CardDescription>
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
                            const totalValues = players.map((p: any) => summaryTotals[p.id]?.total ?? 0)
                            const totalMin = totalValues.length ? Math.min(...totalValues) : 0
                            const totalMax = totalValues.length ? Math.max(...totalValues) : 0
                            return players.map((player: any) => {
                              const totalSecs = summaryTotals[player.id]?.total ?? 0
                              const display = totalSecs > 0 ? formatTime(totalSecs) : '—'
                              return (
                              <TableRow key={player.id}>
                                <TableCell className="font-medium">{player.name}</TableCell>
                                <TableCell
                                  className="text-right font-mono font-semibold"
                                  style={{ color: courtTimeColor(totalSecs, totalMin, totalMax) }}
                                >
                                  {display}
                                </TableCell>
                                {positions.map((p: any) => {
                                  const posSecs = summaryTotals[player.id]?.positions[p.abbreviation] ?? 0
                                  const posDisplay = posSecs > 0 ? formatTime(posSecs) : '—'
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
                     const projection = matchProjections[match.id];
                     const matchTimes = projection?.times ?? {};
                     const played = projection?.played ?? [];
                     const totalPeriods = gameFormat?.numberOfPeriods ?? 0;
                     const status = played.length === 0
                        ? 'Not played yet — showing the plan'
                        : played.length >= totalPeriods
                            ? 'Played'
                            : `Played Q${played.join(', Q')} · rest planned`;
                    return (
                        <Card key={match.id}>
                            <CardHeader>
                                <CardTitle>{match.name}</CardTitle>
                                <CardDescription>Roster: {roster?.name || '...'} | Format: {gameFormat?.name || '...'} | {status}</CardDescription>
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
                                        const matchValues = players.map((p: any) => matchTimes[p.id]?.total ?? 0)
                                        const matchMin = matchValues.length ? Math.min(...matchValues) : 0
                                        const matchMax = matchValues.length ? Math.max(...matchValues) : 0
                                        return players.map((player: any) => {
                                          const playerTime = matchTimes[player.id]?.total || 0
                                          const display = playerTime > 0 ? formatTime(playerTime) : '—'
                                          return (
                                          <TableRow key={player.id}>
                                            <TableCell className="font-medium">{player.name}</TableCell>
                                            <TableCell
                                              className="text-right font-mono font-semibold"
                                              style={{ color: courtTimeColor(playerTime, matchMin, matchMax) }}
                                            >
                                              {display}
                                            </TableCell>
                                            {positions.map((p: any) => {
                                              const posTime = matchTimes[player.id]?.positions[p.abbreviation] || 0
                                              const posDisplay = posTime > 0 ? formatTime(posTime) : '—'
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
                                            <h4 className="text-sm font-semibold mb-2 text-muted-foreground">Planned starting lineups by period</h4>
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
