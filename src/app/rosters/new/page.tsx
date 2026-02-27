import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export default function NewRosterPage() {
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
                    <form className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="roster-name">Roster Name</Label>
                            <Input id="roster-name" placeholder="e.g., Winter 2024 Team" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="players">Players</Label>
                            <Textarea 
                                id="players"
                                placeholder="Enter one player name per line"
                                rows={10}
                            />
                            <p className="text-sm text-muted-foreground">
                                Add each player's name on a new line. You can add positions later.
                            </p>
                        </div>
                        <Button type="submit">Save Roster</Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    </div>
  );
}
