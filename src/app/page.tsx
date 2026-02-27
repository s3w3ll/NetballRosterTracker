import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, FileText, ClipboardList, Trophy, PlayCircle } from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="container mx-auto py-8 px-4">
      <section className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-primary font-headline">
          Netball Court Time Tracker
        </h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
          Manage your team, plan your matches, and track player time with ease. Never lose track of substitutions again.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Button size="lg" asChild>
            <Link href="/games/new">
                <PlayCircle className="mr-2 h-5 w-5" /> Start a New Game
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/plans/new">
                Create Match Plan
            </Link>
          </Button>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <FeatureCard
          icon={<Users className="h-8 w-8 text-primary" />}
          title="Roster Management"
          description="Easily create and manage your team rosters. Keep player information organized and accessible."
          link="/rosters"
        />
        <FeatureCard
          icon={<FileText className="h-8 w-8 text-primary" />}
          title="Match Plans"
          description="Pre-plan your substitutions for each quarter. See projected game time for every player."
          link="/plans"
        />
        <FeatureCard
          icon={<ClipboardList className="h-8 w-8 text-primary" />}
          title="Game History"
          description="Review past games, analyze player statistics, and track performance over time."
          link="/games"
        />
        <FeatureCard
          icon={<Trophy className="h-8 w-8 text-primary" />}
          title="Tournaments"
          description="Group multiple matches into a tournament and get aggregated stats for all players."
          link="/tournaments"
        />
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description, link }: { icon: React.ReactNode; title: string; description: string; link: string }) {
  return (
    <Link href={link} className="block h-full">
      <Card className="h-full hover:shadow-lg hover:border-primary/50 transition-all duration-300 transform hover:-translate-y-1 bg-card">
        <CardHeader>
          <div className="flex items-start gap-4">
            <div className="bg-primary/10 p-3 rounded-lg">
              {icon}
            </div>
            <CardTitle className="font-headline mt-1">{title}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
