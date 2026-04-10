'use client';

import { useRouter } from 'next/navigation';
import { useFirebase } from '@/firebase';
import { useEffect, useState, useCallback } from 'react';
import { apiJSON } from '@/api/client';
import { normalizeMatch, type Match } from '@/api/types';
import { setNavId } from '@/lib/nav';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';

export default function PlansClient() {
  const router = useRouter();
  const { getIdToken } = useFirebase();
  const [plans, setPlans] = useState<Match[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await apiJSON<any[]>('/api/matches?standalone=true', getIdToken);
      setPlans(rows.map(normalizeMatch));
    } finally {
      setIsLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => { load(); }, [load]);

  const handleEdit = (plan: Match) => {
    setNavId('gameId', plan.id);
    setNavId('tournamentId', '');
    router.push('/games/play?mode=plan');
  };

  const handleDelete = async (plan: Match) => {
    if (!confirm(`Delete "${plan.name ?? 'this plan'}"? This cannot be undone.`)) return;
    setDeletingId(plan.id);
    try {
      await apiJSON(`/api/matches/${plan.id}`, getIdToken, { method: 'DELETE' });
      setPlans(prev => prev?.filter(p => p.id !== plan.id) ?? null);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold font-headline">Match Plans</h1>
          <p className="text-muted-foreground">Create and manage your pre-game substitution plans.</p>
        </div>
        <Button asChild>
          <Link href="/plans/new">
            <FileText className="mr-2 h-4 w-4" />
            New Match Plan
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : plans && plans.length > 0 ? (
        <div className="space-y-3">
          {plans.map(plan => (
            <Card key={plan.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="font-semibold">{plan.name ?? 'Unnamed Plan'}</p>
                  {plan.startTime && (
                    <p className="text-sm text-muted-foreground">
                      {new Date(plan.startTime).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleEdit(plan)}>
                    <Pencil className="h-4 w-4 mr-1" />Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(plan)}
                    disabled={deletingId === plan.id}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Your Match Plans</CardTitle>
            <CardDescription>You haven&apos;t created any match plans yet.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center text-center py-20 bg-muted/20 rounded-b-lg">
            <div className="bg-primary/10 p-4 rounded-full mb-4">
              <FileText className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">No Match Plans Found</h3>
            <p className="text-muted-foreground">Strategize your games by creating your first match plan.</p>
            <Button variant="default" className="mt-6" asChild>
              <Link href="/plans/new">
                <FileText className="mr-2 h-4 w-4" />
                Create First Plan
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
