'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { doc, setDoc, collection, writeBatch } from 'firebase/firestore';
import { useDoc, useFirestore, useUser, useMemoFirebase, useCollection } from '@/firebase';
import { useToast } from '@/hooks/use-toast';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import Link from 'next/link';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const gameSetupSchema = z.object({
  gameFormatId: z.string({ required_error: "Please select a game format."}),
});

type GameSetupFormData = z.infer<typeof gameSetupSchema>;

// Function to create default game formats
const createDefaultFormats = async (firestore: any, userId: string) => {
    const batch = writeBatch(firestore);

    const formats = [
        { 
            id: '7-a-side-default',
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
            ]
        },
        {
            id: '6-a-side-default',
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
            ]
        }
    ];

    for (const format of formats) {
        const formatRef = doc(firestore, `users/${userId}/gameFormats`, format.id);
        const { positions, ...formatData } = format;
        batch.set(formatRef, { ...formatData, userId: userId, id: format.id });
        
        for (const position of positions) {
            const positionRef = doc(firestore, `users/${userId}/gameFormats/${format.id}/positions`, position.id);
            batch.set(positionRef, { ...position, gameFormatId: format.id, id: position.id });
        }
    }

    await batch.commit();
};


export default function GameSetupPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const rosterId = params.rosterId as string;
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const rosterRef = useMemoFirebase(() => {
    if (!user || !rosterId) return null;
    return doc(firestore, 'users', user.uid, 'rosters', rosterId);
  }, [firestore, user, rosterId]);
  const { data: roster, isLoading: isRosterLoading } = useDoc(rosterRef);

  const gameFormatsQuery = useMemoFirebase(() => {
      if (!user) return null;
      return collection(firestore, 'users', user.uid, 'gameFormats');
  }, [firestore, user]);
  const { data: gameFormats, isLoading: areFormatsLoading } = useCollection(gameFormatsQuery);

  const [hasCreatedDefaults, setHasCreatedDefaults] = useState(false);

  useEffect(() => {
    if (firestore && user && !areFormatsLoading && gameFormats?.length === 0 && !hasCreatedDefaults) {
      createDefaultFormats(firestore, user.uid).then(() => {
        setHasCreatedDefaults(true); // Prevent re-running
      });
    }
  }, [firestore, user, areFormatsLoading, gameFormats, hasCreatedDefaults]);

  const form = useForm<GameSetupFormData>({
    resolver: zodResolver(gameSetupSchema),
  });

  const selectedFormatId = form.watch('gameFormatId');
  const selectedFormat = gameFormats?.find(f => f.id === selectedFormatId);

  const onSubmit = async (data: GameSetupFormData) => {
    if (!user || !roster || !selectedFormat) {
        toast({ variant: "destructive", title: "Error", description: "Cannot create a match without a user, roster, and game format." });
        return;
    };

    const matchId = uuidv4();
    const newMatch = {
        id: matchId,
        userId: user.uid,
        team1RosterId: roster.id,
        team2RosterId: null,
        startTime: new Date().toISOString(),
        endTime: null,
        gameFormatId: selectedFormat.id,
    };

    const matchDocRef = doc(firestore, `users/${user.uid}/matches`, matchId);
    
    try {
      await setDoc(matchDocRef, newMatch);
      toast({
          title: "Match Created!",
          description: "Your new match has been set up.",
      });
      router.push(`/games/${matchId}`);
    } catch (error) {
       toast({
          variant: "destructive",
          title: "Uh oh! Something went wrong.",
          description: "Could not save the match to the database.",
      });
    }
  };

  const isLoading = isUserLoading || isRosterLoading || areFormatsLoading;

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
                Select a game format to automatically set up the periods and duration.
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
                            {gameFormats?.map(format => (
                                <SelectItem key={format.id} value={format.id}>{format.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            {selectedFormat && (
               <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Format Details: {selectedFormat.name}</AlertTitle>
                <AlertDescription>
                    This format uses {selectedFormat.numberOfPeriods} periods of {selectedFormat.periodDuration} minutes each, for a total of {selectedFormat.numberOfPeriods * selectedFormat.periodDuration} minutes of game time. It is designed for {selectedFormat.teamSize} players on court.
                </AlertDescription>
            </Alert>
            )}

            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={form.formState.isSubmitting || !selectedFormat}>
                {form.formState.isSubmitting ? 'Starting...' : 'Start Match'}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
