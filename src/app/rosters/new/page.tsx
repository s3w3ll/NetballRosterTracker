'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useFirebase } from '@/firebase';
import { collection, addDoc, writeBatch, doc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { useToast } from "@/hooks/use-toast";
import { addDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { v4 as uuidv4 } from 'uuid';

const playerSchema = z.object({
  name: z.string().min(1, "Player name cannot be empty"),
  position: z.string().optional(),
});

const rosterSchema = z.object({
  name: z.string().min(1, "Roster name is required."),
  description: z.string().optional(),
  players: z.array(playerSchema).optional(),
  playerNames: z.string().optional(),
});

type RosterFormData = z.infer<typeof rosterSchema>;

export default function NewRosterPage() {
  const { auth, firestore } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  const form = useForm<RosterFormData>({
    resolver: zodResolver(rosterSchema),
    defaultValues: {
      name: '',
      description: '',
      players: [],
      playerNames: '',
    },
  });

  const onSubmit = async (data: RosterFormData) => {
    if (!auth.currentUser) {
      toast({
        variant: "destructive",
        title: "Authentication Error",
        description: "You must be logged in to create a roster.",
      });
      return;
    }

    try {
        const playerNames = data.playerNames?.split('\n').filter(name => name.trim() !== '') || [];
        const rosterId = uuidv4();
        const playerIds = [];

        const batch = writeBatch(firestore);

        const playersCollectionRef = collection(firestore, `users/${auth.currentUser.uid}/rosters/${rosterId}/players`);
        
        for (const playerName of playerNames) {
            const playerId = uuidv4();
            const playerRef = doc(playersCollectionRef, playerId);
            batch.set(playerRef, {
                id: playerId,
                name: playerName,
                position: "Unknown", // Default position
                rosterId: rosterId
            });
            playerIds.push(playerId);
        }

        const rosterRef = doc(firestore, `users/${auth.currentUser.uid}/rosters/${rosterId}`);
        batch.set(rosterRef, {
            id: rosterId,
            userId: auth.currentUser.uid,
            name: data.name,
            description: data.description,
            playerIds: playerIds
        });
        
        await batch.commit();

      toast({
        title: "Roster Created",
        description: `The "${data.name}" roster has been successfully created.`,
      });
      router.push('/rosters');
    } catch (e: any) {
      console.error("Error creating roster:", e);
      toast({
        variant: "destructive",
        title: "Uh oh! Something went wrong.",
        description: e.message || "Could not create the roster.",
      });
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Create New Roster</CardTitle>
            <CardDescription>
              A roster is a list of players for a specific team or season.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Roster Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Winter 2024 Team" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="A short description for this roster" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="playerNames"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Players</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Enter one player name per line"
                          rows={10}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Add each player's name on a new line. You can add positions later.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? 'Saving...' : 'Save Roster'}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
