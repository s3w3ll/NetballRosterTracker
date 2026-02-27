import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy } from "lucide-react";

export default function TournamentsPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold font-headline">Tournaments</h1>
          <p className="text-muted-foreground">Track player stats across multiple games in a tournament.</p>
        </div>
        <Button>
          <Trophy className="mr-2 h-4 w-4" />
          New Tournament
        </Button>
      </div>

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
           <Button variant="default" className="mt-6">
            <Trophy className="mr-2 h-4 w-4" />
            Create First Tournament
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
