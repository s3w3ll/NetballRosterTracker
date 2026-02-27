import Loader from './loader';

export function generateStaticParams() {
  return [{ tournamentId: '_' }];
}

export default function TournamentDetailsPage() {
  return <Loader />;
}
