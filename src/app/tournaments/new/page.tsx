'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useFirebase } from '@/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { useToast } from "@/hooks/use-toast";
import { v4 as uuidv4 } from 'uuid';

const tournamentSchema = z.object({
  name: z.string().min(1, "Tournament name is required."),
});

type TournamentFormData = z.infer<typeof tournamentSchema>;

export default function NewTournamentPage() {
  const { auth, firestore } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  const form = useForm<TournamentFormData>({
    resolver: zodResolver(tournamentSchema),
    defaultValues: {
      name: '',
    },
  });

  const onSubmit = async (data: TournamentFormData) => {
    if (!auth.currentUser) {
      toast({
        variant: "destructive",
        title: "Authentication Error",
        description: "You must be logged in to create a tournament.",
      });
      return;
    }

    const tournamentId = uuidv4();
    const newTournament = {
        id: tournamentId,
        userId: auth.currentUser.uid,
        name: data.name,
        matchIds: [],
    }

    try {
        const tournamentRef = doc(firestore, `users/${auth.currentUser.uid}/tournaments`, tournamentId);
        await setDoc(tournamentRef, newTournament);

      toast({
        title: "Tournament Created",
        description: `The "${data.name}" tournament has been created.`,
      });
      router.push(`/tournaments/${tournamentId}/add-match`);
    } catch (e: any) {
      console.error("Error creating tournament:", e);
      toast({
        variant: "destructive",
        title: "Uh oh! Something went wrong.",
        description: e.message || "Could not create the tournament.",
      });
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Create New Tournament</CardTitle>
            <CardDescription>
              A tournament is a collection of matches. Give it a name to get started.
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
                      <FormLabel>Tournament Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Summer Championship" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? 'Saving...' : 'Create and Add Matches'}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
