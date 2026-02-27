'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { doc, collection } from 'firebase/firestore';
import { useDoc, useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlusCircle, Trash2, User as UserIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { addDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from "@/hooks/use-toast";

const playerSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Player name is required"),
  position: z.string().optional(),
});

const rosterDetailsSchema = z.object({
  newPlayerName: z.string().optional(),
});


export default function RosterDetailsPage() {
  const params = useParams();
  const rosterId = params.rosterId as string;
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const rosterRef = useMemoFirebase(() => {
    if (!user || !rosterId) return null;
    return doc(firestore, 'users', user.uid, 'rosters', rosterId);
  }, [firestore, user, rosterId]);

  const { data: roster, isLoading: isRosterLoading } = useDoc(rosterRef);

  const playersQuery = useMemoFirebase(() => {
    if (!user || !rosterId) return null;
    return collection(firestore, 'users', user.uid, 'rosters', rosterId, 'players');
  }, [firestore, user, rosterId]);

  const { data: players, isLoading: arePlayersLoading } = useCollection(playersQuery);
  
  const form = useForm({
    resolver: zodResolver(rosterDetailsSchema),
    defaultValues: {
      newPlayerName: "",
    },
  });

  const handleAddPlayer = async (data: z.infer<typeof rosterDetailsSchema>) => {
    if (!user || !rosterId || !data.newPlayerName) return;

    const newPlayerId = uuidv4();
    const newPlayer = {
        id: newPlayerId,
        name: data.newPlayerName,
        position: 'Unknown',
        rosterId: rosterId
    }

    const playerRef = doc(firestore, 'users', user.uid, 'rosters', rosterId, 'players', newPlayerId);
    
    addDocumentNonBlocking(collection(firestore, 'users', user.uid, 'rosters', rosterId, 'players'), newPlayer);
    
    toast({
        title: "Player Added",
        description: `${data.newPlayerName} has been added to the roster.`
    });

    form.reset();
  };

  const handleDeletePlayer = (playerId: string, playerName: string) => {
    if (!user || !rosterId) return;

    const playerRef = doc(firestore, 'users', user.uid, 'rosters', rosterId, 'players', playerId);
    deleteDocumentNonBlocking(playerRef);

    toast({
        title: "Player Removed",
        description: `${playerName} has been removed from the roster.`
    });
  }

  const isLoading = isUserLoading || isRosterLoading || arePlayersLoading;

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-6 w-96 mb-6" />
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                  <Skeleton className="h-8 w-40" />
                  <Skeleton className="h-8 w-8" />
              </div>
               <div className="flex items-center justify-between">
                  <Skeleton className="h-8 w-40" />
                  <Skeleton className="h-8 w-8" />
              </div>
               <div className="flex items-center justify-between">
                  <Skeleton className="h-8 w-40" />
                  <Skeleton className="h-8 w-8" />
              </div>
            </CardContent>
             <CardFooter className='bg-muted/50 p-4 rounded-b-lg border-t'>
                  <div className="flex gap-2 w-full">
                      <Skeleton className="h-10 flex-grow" />
                      <Skeleton className="h-10 w-24" />
                  </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

  if (!roster) {
    return (
      <div className="container mx-auto py-8 px-4 text-center">
        <h1 className="text-2xl font-bold">Roster not found</h1>
        <p className="text-muted-foreground">This roster does not exist or you do not have permission to view it.</p>
        <Button asChild className="mt-4">
          <Link href="/rosters">Back to Rosters</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
            <h1 className="text-3xl font-bold font-headline">{roster.name}</h1>
            <p className="text-muted-foreground">{roster.description}</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Players ({players?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
                {players && players.map((player) => (
                    <div key={player.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50">
                        <div className='flex items-center gap-3'>
                            <UserIcon className="h-5 w-5 text-muted-foreground" />
                            <span className="font-medium">{player.name}</span>
                        </div>
                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => handleDeletePlayer(player.id, player.name)}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                ))}
                {players?.length === 0 && <p className="text-muted-foreground text-center py-4">No players in this roster yet.</p>}
            </div>
          </CardContent>
          <CardFooter className='bg-muted/50 p-4 rounded-b-lg border-t'>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(handleAddPlayer)} className="flex gap-2 w-full">
                     <FormField
                        control={form.control}
                        name="newPlayerName"
                        render={({ field }) => (
                            <FormItem className='flex-grow'>
                                <FormControl>
                                    <Input placeholder="New player name..." {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                        />
                    <Button type="submit">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add
                    </Button>
                </form>
            </Form>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
