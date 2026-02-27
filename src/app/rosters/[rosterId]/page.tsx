import Loader from './loader';

export function generateStaticParams() {
  return [{ rosterId: '_' }];
}

export default function RosterDetailsPage() {
  return <Loader />;
}
