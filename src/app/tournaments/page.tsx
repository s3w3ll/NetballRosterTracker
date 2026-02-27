'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle, Trophy, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useUser, useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query } from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";

export default function TournamentsPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const tournamentsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, "users", user.uid, "tournaments"));
  }, [firestore, user]);

  const { data: tournaments, isLoading } = useCollection(tournamentsQuery);
  const loading = isUserLoading || isLoading;

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold font-headline">Tournaments</h1>
          <p className="text-muted-foreground">Track player stats across multiple games in a tournament.</p>
        </div>
        <Button asChild>
            <Link href="/tournaments/new">
                <Trophy className="mr-2 h-4 w-4" />
                New Tournament
            </Link>
        </Button>
      </div>

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
        </div>
      )}

      {!loading && tournaments && tournaments.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tournaments.map((tournament) => (
            <Card key={tournament.id}>
              <CardHeader>
                <CardTitle>{tournament.name}</CardTitle>
                <CardDescription>{tournament.matchIds?.length || 0} games</CardDescription>
              </CardHeader>
              <CardContent>
                
              </CardContent>
              <CardFooter>
                 <Button variant="outline" asChild className="w-full">
                    <Link href={`/tournaments/${tournament.id}`}>
                        View Details <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                 </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}


      {!loading && (!tournaments || tournaments.length === 0) && (
        <Card>
            <CardHeader>
            <CardTitle>Your Tournaments</CardTitle>
            <CardDescription>You haven't created any tournaments yet.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center text-center py-20 bg-muted/20 rounded-b-lg">
            <div className="bg-primary/10 p-4 rounded-full mb-4">
                <Trophy className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">No Tournaments Created</h3>
            <p className="text-muted-foreground">Organize your matches by creating your first tournament.</p>
            <Button variant="default" className="mt-6" asChild>
                <Link href="/tournaments/new">
                    <Trophy className="mr-2 h-4 w-4" />
                    Create First Tournament
                </Link>
            </Button>
            </CardContent>
        </Card>
      )}
    </div>
  );
}
