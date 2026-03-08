'use client';
import { useState, useEffect, ComponentType } from 'react';

export default function Loader() {
  const [Component, setComponent] = useState<ComponentType | null>(null);
  useEffect(() => {
    import('./client').then(m => setComponent(() => m.default));
  }, []);
  if (!Component) return null;
  return <Component />;
}
