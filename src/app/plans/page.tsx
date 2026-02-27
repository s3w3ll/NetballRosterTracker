import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import Link from "next/link";

export default function MatchPlansPage() {
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

      <Card>
        <CardHeader>
          <CardTitle>Your Match Plans</CardTitle>
          <CardDescription>You haven't created any match plans yet.</CardDescription>
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
    </div>
  );
}
