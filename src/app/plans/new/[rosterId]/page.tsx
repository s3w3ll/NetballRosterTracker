'use client';

import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { doc, setDoc, writeBatch, collection } from 'firebase/firestore';
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
  gameFormatId: z.string({ required_error: "Please select a game format."}),
});

type PlanSetupFormData = z.infer<typeof planSetupSchema>;

export default function PlanSetupPage() {
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

  const form = useForm<PlanSetupFormData>({
    resolver: zodResolver(planSetupSchema),
  });

  const onSubmit = async (data: PlanSetupFormData) => {
    if (!user || !roster) {
        toast({ variant: "destructive", title: "Error", description: "Cannot create a match plan without a user and roster." });
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
        name: `Plan for ${roster.name}`,
        team1RosterId: roster.id,
        startTime: new Date().toISOString(),
        gameFormatId: originalFormat.id, 
    };

    const matchDocRef = doc(firestore, `users/${user.uid}/matches`, matchId);
    batch.set(matchDocRef, newMatch);

    // Create multiple MatchPlan documents, one for each quarter
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
    
    try {
      await batch.commit();
      toast({
          title: "Match Plan Created!",
          description: "Your new match plan has been set up.",
      });
      // Redirect to the unified game page, with a query param to default to "plan" mode
      router.push(`/games/${matchId}?mode=plan`);
    } catch (error: any) {
       toast({
          variant: "destructive",
          title: "Uh oh! Something went wrong.",
          description: error.message || "Could not save the match plan to the database.",
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
                <Link href="/plans/new">Back to Roster Selection</Link>
            </Button>
        </div>
    )
  }


  return (
    <div className="container mx-auto py-8 px-4 max-w-xl">
        <div className="text-center mb-8">
            <h1 className="text-3xl font-bold font-headline">Match Plan Setup</h1>
            <p className="text-muted-foreground">Configure the details for your plan with <span className="font-semibold text-primary">{roster.name}</span>.</p>
        </div>
      <Card>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardHeader>
              <CardTitle>Game Format</CardTitle>
              <CardDescription>
                Select the game format this plan will be based on.
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
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Saving...' : 'Create Plan'}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
