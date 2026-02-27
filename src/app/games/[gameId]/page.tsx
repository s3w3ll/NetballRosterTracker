import Loader from './loader';

export function generateStaticParams() {
  return [{ gameId: '_' }];
}

export default function GamePage() {
  return <Loader />;
}
