import Loader from './loader';

export function generateStaticParams() {
  return [{ tournamentId: '_' }];
}

export default function AddMatchToTournamentPage() {
  return <Loader />;
}
