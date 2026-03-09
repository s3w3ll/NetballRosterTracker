'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle, Users, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from "next/navigation";
import { setNavId } from "@/lib/nav";
import { useRosters } from "@/api/hooks/use-rosters";

export default function RostersPage() {
  const router = useRouter();
  const { data: rosters, isLoading } = useRosters();

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold font-headline">Team Rosters</h1>
          <p className="text-muted-foreground">Manage your player lists for different teams or seasons.</p>
        </div>
        <Button asChild>
          <Link href="/rosters/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            New Roster
          </Link>
        </Button>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
        </div>
      )}

      {!isLoading && rosters && rosters.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rosters.map((roster) => (
            <Card key={roster.id}>
              <CardHeader>
                <CardTitle>{roster.name}</CardTitle>
                <CardDescription>{roster.description || 'No description'}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center text-sm text-muted-foreground">
                    <Users className="mr-2 h-4 w-4" />
                    <span>{roster.playerCount} Players</span>
                </div>
              </CardContent>
              <CardFooter>
                 <Button variant="outline" className="w-full" onClick={() => { setNavId('rosterId', roster.id); router.push('/rosters/manage'); }}>
                    Manage Roster <ArrowRight className="ml-2 h-4 w-4" />
                 </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {!isLoading && (!rosters || rosters.length === 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Your Rosters</CardTitle>
            <CardDescription>You haven't created any rosters yet.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center text-center py-20 bg-muted/20 rounded-b-lg">
            <div className="bg-primary/10 p-4 rounded-full mb-4">
              <Users className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">No Rosters Found</h3>
            <p className="text-muted-foreground max-w-sm mx-auto mt-1">Get started by creating a new roster to manage your players.</p>
            <Button variant="default" className="mt-6" asChild>
              <Link href="/rosters/new">
                <PlusCircle className="mr-2 h-4 w-4" />
                Create First Roster
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
