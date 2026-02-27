'use client';

import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { doc, setDoc, writeBatch, collection, updateDoc, arrayUnion } from 'firebase/firestore';
import { useDoc, useFirestore, useUser, useMemoFirebase, useCollection } from '@/firebase';
import { useToast } from '@/hooks/use-toast';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const planSetupSchema = z.object({
  rosterId: z.string({ required_error: "Please select a roster."}),
  gameFormatId: z.string({ required_error: "Please select a game format."}),
  matchName: z.string().min(1, "Please give this match a name."),
});

type PlanSetupFormData = z.infer<typeof planSetupSchema>;

export default function AddMatchToTournamentPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const tournamentId = params.tournamentId as string;
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const tournamentRef = useMemoFirebase(() => {
    if (!user || !tournamentId) return null;
    return doc(firestore, 'users', user.uid, 'tournaments', tournamentId);
  }, [firestore, user, tournamentId]);
  const { data: tournament, isLoading: isTournamentLoading } = useDoc(tournamentRef);

  const rostersQuery = useMemoFirebase(() => {
    if (!user) return null;
    return collection(firestore, 'users', user.uid, 'rosters');
  }, [firestore, user]);
  const { data: rosters, isLoading: areRostersLoading } = useCollection(rostersQuery);
  
  const gameFormatsQuery = useMemoFirebase(() => {
      if (!user) return null;
      return collection(firestore, 'users', user.uid, 'gameFormats');
  }, [firestore, user]);
  const { data: gameFormats, isLoading: areFormatsLoading } = useCollection(gameFormatsQuery);

  const form = useForm<PlanSetupFormData>({
    resolver: zodResolver(planSetupSchema),
  });

  const onSubmit = async (data: PlanSetupFormData) => {
    if (!user || !tournament) {
        toast({ variant: "destructive", title: "Error", description: "Cannot create a match plan without a user and tournament." });
        return;
    };

    const originalFormat = gameFormats?.find(f => f.id === data.gameFormatId);
    if (!originalFormat) {
       toast({ variant: "destructive", title: "Error", description: "Selected game format not found." });
       return;
    }
    
    const batch = writeBatch(firestore);

    const matchId = uuidv4();
    const newMatch = {
        id: matchId,
        userId: user.uid,
        name: data.matchName,
        team1RosterId: data.rosterId,
        startTime: new Date().toISOString(),
        gameFormatId: originalFormat.id, 
        tournamentId: tournament.id,
    };

    const matchDocRef = doc(firestore, `users/${user.uid}/matches`, matchId);
    batch.set(matchDocRef, newMatch);

    for (let i = 1; i <= originalFormat.numberOfPeriods; i++) {
        const matchPlanId = uuidv4();
        const newMatchPlan = {
            id: matchPlanId,
            matchId: matchId,
            quarter: i, 
            playerPositions: [],
        };
        const planDocRef = doc(firestore, `users/${user.uid}/matches/${matchId}/matchPlans`, matchPlanId);
        batch.set(planDocRef, newMatchPlan);
    }

    const tournamentDocRef = doc(firestore, `users/${user.uid}/tournaments`, tournament.id);
    batch.update(tournamentDocRef, {
        matchIds: arrayUnion(matchId)
    });
    
    try {
      await batch.commit();
      toast({
          title: "Match Added to Tournament!",
          description: "Create the match plan for this game now.",
      });
      router.push(`/games/${matchId}?mode=plan`);
    } catch (error: any) {
       toast({
          variant: "destructive",
          title: "Uh oh! Something went wrong.",
          description: error.message || "Could not save the match plan to the database.",
      });
    }
  };

  const isLoading = isUserLoading || isTournamentLoading || areFormatsLoading || areRostersLoading;

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
          <CardFooter className="flex justify-between">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (!tournament) {
    return (
        <div className="container mx-auto py-8 px-4 max-w-xl">
            <Alert variant="destructive">
                <AlertTitle>Tournament Not Found</AlertTitle>
                <AlertDescription>
                    The selected tournament could not be found. It may have been deleted.
                </AlertDescription>
            </Alert>
            <Button asChild variant="link" className="mt-4">
                <Link href="/tournaments">Back to Tournaments</Link>
            </Button>
        </div>
    )
  }


  return (
    <div className="container mx-auto py-8 px-4 max-w-xl">
        <div className="text-center mb-8">
            <h1 className="text-3xl font-bold font-headline">Add Match to {tournament.name}</h1>
            <p className="text-muted-foreground">Configure the details for the next match in your tournament.</p>
        </div>
      <Card>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardHeader>
              <CardTitle>Match Setup</CardTitle>
              <CardDescription>
                Select a roster and game format for this match.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <FormField
                    control={form.control}
                    name="matchName"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Match Name</FormLabel>
                        <FormControl>
                            <Input placeholder="e.g., Round 1 vs. Opponent" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />
               <FormField
                control={form.control}
                name="rosterId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Roster</FormLabel>
                     <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a roster..." />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            {rosters?.map(roster => (
                                <SelectItem key={roster.id} value={roster.id}>{roster.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Saving...' : 'Save and Create Plan'}
              </Button>
               <Button variant="secondary" asChild>
                <Link href={`/tournaments/${tournamentId}`}>Finish</Link>
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
