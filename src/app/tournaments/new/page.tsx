'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirebase } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useToast } from "@/hooks/use-toast";
import { v4 as uuidv4 } from 'uuid';
import { apiJSON } from '@/api/client';
import { setNavId } from '@/lib/nav';
import { useRosters } from '@/api/hooks/use-rosters';
import { useGameFormats } from '@/api/hooks/use-game-formats';

const tournamentSchema = z.object({
  name: z.string().min(1, "Tournament name is required."),
  numberOfGames: z.string().optional(),
  rosterId: z.string().optional(),
  gameFormatId: z.string().optional(),
}).superRefine((data, ctx) => {
  const n = data.numberOfGames ? Number(data.numberOfGames) : NaN
  if (!isNaN(n) && n > 0) {
    if (!data.rosterId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rosterId'], message: 'Please select a roster.' })
    }
    if (!data.gameFormatId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['gameFormatId'], message: 'Please select a game format.' })
    }
  }
})

type TournamentFormData = z.infer<typeof tournamentSchema>;

export default function NewTournamentPage() {
  const { getIdToken } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const { data: rosters, isLoading: areRostersLoading } = useRosters();
  const { data: gameFormats, isLoading: areFormatsLoading } = useGameFormats();

  const form = useForm<TournamentFormData>({
    resolver: zodResolver(tournamentSchema),
    defaultValues: { name: '', numberOfGames: '', rosterId: undefined, gameFormatId: undefined },
  });

  const numberOfGames = form.watch('numberOfGames');
  const isGenerating = Boolean(numberOfGames && Number(numberOfGames) > 0);

  const onSubmit = async (data: TournamentFormData) => {
    try {
      const tournamentId = uuidv4();

      await apiJSON('/api/tournaments', getIdToken, {
        method: 'POST',
        body: JSON.stringify({ id: tournamentId, name: data.name }),
      });

      const n = data.numberOfGames ? parseInt(data.numberOfGames, 10) : NaN;
      if (!isNaN(n) && n > 0 && data.rosterId && data.gameFormatId) {
        try {
          await apiJSON(`/api/tournaments/${tournamentId}/generate`, getIdToken, {
            method: 'POST',
            body: JSON.stringify({
              rosterId: data.rosterId,
              gameFormatId: data.gameFormatId,
              numberOfGames: n,
            }),
          });
          toast({
            title: "Tournament Generated",
            description: `"${data.name}" created with ${n} games and balanced match plans.`,
          });
        } catch (generateError: any) {
          console.error("Error generating tournament games:", generateError);
          toast({
            variant: "destructive",
            title: "Games could not be generated",
            description: `The tournament was created, but game generation failed: ${generateError.message || "Unknown error"}. You can add games manually.`,
          });
        }
        setNavId('tournamentId', tournamentId);
        router.push('/tournaments/view');
      } else {
        toast({
          title: "Tournament Created",
          description: `The "${data.name}" tournament has been created.`,
        });
        setNavId('tournamentId', tournamentId);
        router.push('/tournaments/add-match');
      }
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
              Give your tournament a name. Optionally enter the number of games to auto-generate all matches and balanced match plans.
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

                <FormField
                  control={form.control}
                  name="numberOfGames"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Number of Games <span className="text-muted-foreground">(optional)</span></FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={20}
                          step={1}
                          placeholder="Leave blank to add games manually"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {isGenerating && (
                  <>
                    <FormField
                      control={form.control}
                      name="rosterId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Roster</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger disabled={areRostersLoading}>
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
                              <SelectTrigger disabled={areFormatsLoading}>
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
                  </>
                )}

                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting
                    ? 'Saving...'
                    : isGenerating
                      ? 'Generate Tournament'
                      : 'Create and Add Matches'}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
