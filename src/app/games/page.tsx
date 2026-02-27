import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlayCircle, ClipboardList } from "lucide-react";
import Link from "next/link";

export default function GamesPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold font-headline">Game History</h1>
          <p className="text-muted-foreground">Review completed games and player statistics.</p>
        </div>
        <Button asChild>
            <Link href="/games/new">
                <PlayCircle className="mr-2 h-4 w-4" />
                Start New Game
            </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Completed Games</CardTitle>
          <CardDescription>No games have been saved yet.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center text-center py-20 bg-muted/20 rounded-b-lg">
          <div className="bg-primary/10 p-4 rounded-full mb-4">
            <ClipboardList className="h-10 w-10 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">No Game History</h3>
          <p className="text-muted-foreground">Your completed games will appear here after you save them.</p>
          <Button variant="default" className="mt-6" asChild>
            <Link href="/games/new">
                <PlayCircle className="mr-2 h-4 w-4" />
                Play Your First Game
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
