'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, PlusCircle, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useUser, useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query } from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

export default function NewPlanPage() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const [rosterId, setRosterId] = useState<string | null>(null);

    const rostersQuery = useMemoFirebase(() => {
        if (!user) return null;
        return query(collection(firestore, "users", user.uid, "rosters"));
    }, [firestore, user]);

    const { data: rosters, isLoading: isRostersLoading } = useCollection(rostersQuery);

    const isLoading = isUserLoading || isRostersLoading;

    if (isLoading) {
        return (
            <div className="container mx-auto py-8 px-4">
                <div className="max-w-xl mx-auto">
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-bold font-headline">Create a New Match Plan</h1>
                        <p className="text-muted-foreground">Select a roster to start planning your strategy.</p>
                    </div>
                    <Card>
                        <CardHeader>
                            <CardTitle>Select a Roster</CardTitle>
                        </CardHeader>
                        <CardContent>
                           <Skeleton className="h-24 w-full" />
                        </CardContent>
                        <CardFooter>
                            <Skeleton className="h-10 w-40" />
                        </CardFooter>
                    </Card>
                </div>
            </div>
        )
    }

    if (!rosters || rosters.length === 0) {
        return (
            <div className="container mx-auto py-8 px-4">
                <div className="max-w-md mx-auto">
                    <Card className="text-center">
                        <CardHeader>
                            <div className="mx-auto bg-primary/10 p-3 rounded-full w-fit">
                                <Users className="h-8 w-8 text-primary" />
                            </div>
                            <CardTitle>No Rosters Found</CardTitle>
                            <CardDescription>
                                You need at least one roster to create a match plan.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button asChild>
                                <Link href="/rosters/new">
                                    <PlusCircle className="mr-2 h-4 w-4" />
                                    Create a New Roster
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        )
    }

  return (
    <div className="container mx-auto py-8 px-4">
        <div className="max-w-xl mx-auto">
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold font-headline">Create a New Match Plan</h1>
                <p className="text-muted-foreground">Select a roster to start planning your strategy.</p>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Select a Team</CardTitle>
                    <CardDescription>Choose the roster you want to create a plan for.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        <h3 className="font-semibold">Your Roster</h3>
                         <Select onValueChange={setRosterId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a roster..." />
                            </SelectTrigger>
                            <SelectContent>
                                {rosters.map(roster => (
                                    <SelectItem key={roster.id} value={roster.id}>{roster.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
                <CardFooter>
                    <Button asChild disabled={!rosterId}>
                        <Link href={`/plans/new/${rosterId}`}>
                            Continue to Plan Setup <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                </CardFooter>
            </Card>
        </div>
    </div>
  );
}
