'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useFirebase } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useToast } from "@/hooks/use-toast";
import { v4 as uuidv4 } from 'uuid';
import { apiJSON } from '@/api/client';

const rosterSchema = z.object({
  name: z.string().min(1, "Roster name is required."),
  description: z.string().optional(),
  playerNames: z.string().optional(),
});

type RosterFormData = z.infer<typeof rosterSchema>;

export default function NewRosterPage() {
  const { getIdToken } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  const form = useForm<RosterFormData>({
    resolver: zodResolver(rosterSchema),
    defaultValues: {
      name: '',
      description: '',
      playerNames: '',
    },
  });

  const onSubmit = async (data: RosterFormData) => {
    try {
      const playerNames = data.playerNames?.split('\n').filter(name => name.trim() !== '') || [];
      const rosterId = uuidv4();
      const players = playerNames.map(name => ({
        id: uuidv4(),
        name: name.trim(),
        position: 'Unknown',
      }));

      await apiJSON('/api/rosters', getIdToken, {
        method: 'POST',
        body: JSON.stringify({
          id: rosterId,
          name: data.name,
          description: data.description || null,
          players,
        }),
      });

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
