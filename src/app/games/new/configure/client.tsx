'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { useFirebase } from '@/firebase';
import { useRoster } from '@/api/hooks/use-rosters';
import { useGameFormats } from '@/api/hooks/use-game-formats';
import { apiJSON } from '@/api/client';
import { useToast } from '@/hooks/use-toast';
import { getNavId, setNavId } from '@/lib/nav';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const gameSetupSchema = z.object({
  gameFormatId: z.string({ required_error: "Please select a game format."}),
  numberOfPeriods: z.coerce.number().min(1, "There must be at least one period."),
  periodDuration: z.coerce.number().min(1, "Duration must be at least one minute."),
});

type GameSetupFormData = z.infer<typeof gameSetupSchema>;

const DEFAULT_FORMATS = [
  {
    id: uuidv4(),
    name: 'Standard 7-a-side',
    teamSize: 7,
    numberOfPeriods: 4,
    periodDuration: 15,
    positions: [
      { id: uuidv4(), name: 'Goal Shooter', abbreviation: 'GS', icon: 'Target' },
      { id: uuidv4(), name: 'Goal Attack', abbreviation: 'GA', icon: 'Target' },
      { id: uuidv4(), name: 'Wing Attack', abbreviation: 'WA', icon: 'Feather' },
      { id: uuidv4(), name: 'Centre', abbreviation: 'C', icon: 'Circle' },
      { id: uuidv4(), name: 'Wing Defence', abbreviation: 'WD', icon: 'Feather' },
      { id: uuidv4(), name: 'Goal Defence', abbreviation: 'GD', icon: 'Shield' },
      { id: uuidv4(), name: 'Goal Keeper', abbreviation: 'GK', icon: 'User' },
    ],
  },
  {
    id: uuidv4(),
    name: 'Fast 6-a-side',
    teamSize: 6,
    numberOfPeriods: 4,
    periodDuration: 8,
    positions: [
      { id: uuidv4(), name: 'Attack 1', abbreviation: 'A1', icon: 'Target' },
      { id: uuidv4(), name: 'Attack 2', abbreviation: 'A2', icon: 'Target' },
      { id: uuidv4(), name: 'Center 1', abbreviation: 'C1', icon: 'Circle' },
      { id: uuidv4(), name: 'Center 2', abbreviation: 'C2', icon: 'Circle' },
      { id: uuidv4(), name: 'Defence 1', abbreviation: 'D1', icon: 'Shield' },
      { id: uuidv4(), name: 'Defence 2', abbreviation: 'D2', icon: 'Shield' },
    ],
  },
];

const createDefaultFormats = async (getIdToken: () => Promise<string>) => {
  for (const format of DEFAULT_FORMATS) {
    await apiJSON('/api/game-formats', getIdToken, {
      method: 'POST',
      body: JSON.stringify(format),
    });
  }
};


export default function GameSetupPage() {
  const router = useRouter();
  const { toast } = useToast();
  const rosterId = getNavId('rosterId');
  const { getIdToken } = useFirebase();

  const { data: roster, isLoading: isRosterLoading } = useRoster(rosterId);
  const { data: gameFormats, isLoading: areFormatsLoading, refetch: refetchFormats } = useGameFormats();

  const [hasCreatedDefaults, setHasCreatedDefaults] = useState(false);

  useEffect(() => {
    if (!areFormatsLoading && gameFormats?.length === 0 && !hasCreatedDefaults) {
      createDefaultFormats(getIdToken)
        .then(() => { setHasCreatedDefaults(true); refetchFormats(); })
        .catch((err) => {
          toast({ variant: 'destructive', title: 'Setup Error', description: err?.message || 'Could not create default game formats.' });
        });
    }
  }, [areFormatsLoading, gameFormats, hasCreatedDefaults, getIdToken, refetchFormats, toast]);

  const form = useForm<GameSetupFormData>({
    resolver: zodResolver(gameSetupSchema),
    defaultValues: {
      numberOfPeriods: 0,
      periodDuration: 0,
    }
  });

  const selectedFormatId = form.watch('gameFormatId');

  useEffect(() => {
    const selectedFormat = gameFormats?.find(f => f.id === selectedFormatId);
    if (selectedFormat) {
      form.setValue('numberOfPeriods', selectedFormat.numberOfPeriods);
      form.setValue('periodDuration', selectedFormat.periodDuration);
    }
  }, [selectedFormatId, gameFormats, form]);


  const onSubmit = async (data: GameSetupFormData) => {
    if (!roster) {
        toast({ variant: "destructive", title: "Error", description: "Cannot create a match without a roster." });
        return;
    }

    const originalFormat = gameFormats?.find(f => f.id === data.gameFormatId);
    if (!originalFormat) {
       toast({ variant: "destructive", title: "Error", description: "Selected game format not found." });
       return;
    }

    try {
      // Fetch positions from the original format
      const fullFormat = await apiJSON<any>(`/api/game-formats/${originalFormat.id}`, getIdToken);
      const copiedPositions = (fullFormat.positions ?? []).map((p: any) => ({
        id: uuidv4(), name: p.name, abbreviation: p.abbreviation, icon: p.icon,
      }));

      const tempGameFormatId = uuidv4();
      await apiJSON('/api/game-formats', getIdToken, {
        method: 'POST',
        body: JSON.stringify({
          id: tempGameFormatId,
          name: `${originalFormat.name} (Custom)`,
          teamSize: originalFormat.teamSize,
          numberOfPeriods: data.numberOfPeriods,
          periodDuration: data.periodDuration,
          isTemporary: true,
          positions: copiedPositions,
        }),
      });

      const matchId = uuidv4();
      await apiJSON('/api/matches', getIdToken, {
        method: 'POST',
        body: JSON.stringify({
          id: matchId,
          team1RosterId: roster.id,
          startTime: new Date().toISOString(),
          gameFormatId: tempGameFormatId,
        }),
      });

      toast({ title: "Match Created!", description: "Your new match has been set up." });
      setNavId('gameId', matchId);
      router.push('/games/play');
    } catch (error: any) {
       toast({
          variant: "destructive",
          title: "Uh oh! Something went wrong.",
          description: error.message || "Could not save the match to the database.",
      });
    }
  };

  const isLoading = isRosterLoading || areFormatsLoading;

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-xl">
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-6 w-80 mb-8" />
        <Card>
          <CardHeader>
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-5 w-full" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
          <CardFooter>
            <Skeleton className="h-10 w-32" />
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (!rosterId) {
    return (
        <div className="container mx-auto py-8 px-4 max-w-xl">
            <Alert variant="destructive">
                <AlertTitle>No Roster Selected</AlertTitle>
                <AlertDescription>
                    Please go back and select a roster to continue.
                </AlertDescription>
            </Alert>
            <Button asChild variant="link" className="mt-4">
                <Link href="/games/new">Back to Roster Selection</Link>
            </Button>
        </div>
    )
  }

  if (!roster) {
    return (
        <div className="container mx-auto py-8 px-4 max-w-xl">
            <Alert variant="destructive">
                <AlertTitle>Roster Not Found</AlertTitle>
                <AlertDescription>
                    The selected roster could not be found. It may have been deleted.
                    Please go back and select a different roster.
                </AlertDescription>
            </Alert>
            <Button asChild variant="link" className="mt-4">
                <Link href="/games/new">Back to Roster Selection</Link>
            </Button>
        </div>
    )
  }


  return (
    <div className="container mx-auto py-8 px-4 max-w-xl">
        <div className="text-center mb-8">
            <h1 className="text-3xl font-bold font-headline">Game Setup</h1>
            <p className="text-muted-foreground">Configure the details for your match with <span className="font-semibold text-primary">{roster.name}</span>.</p>
        </div>
      <Card>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardHeader>
              <CardTitle>Match Details</CardTitle>
              <CardDescription>
                Select a game format, then customize the timing if needed for this specific match.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <FormField
                control={form.control}
                name="gameFormatId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Game Format</FormLabel>
                     <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a game format..." />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            {gameFormats?.filter(f => !f.isTemporary).map(format => (
                                <SelectItem key={format.id} value={format.id}>{format.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            {selectedFormatId && (
               <Card className="bg-muted/50">
                 <CardHeader>
                    <CardTitle className="text-lg">Customize Format</CardTitle>
                 </CardHeader>
                 <CardContent className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="numberOfPeriods"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Periods</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                     <FormField
                      control={form.control}
                      name="periodDuration"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Period Duration</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} />
                          </FormControl>
                          <FormDescription className="text-xs">in minutes</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                 </CardContent>
               </Card>
            )}

            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={form.formState.isSubmitting || !selectedFormatId}>
                {form.formState.isSubmitting ? 'Starting...' : 'Start Match'}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
