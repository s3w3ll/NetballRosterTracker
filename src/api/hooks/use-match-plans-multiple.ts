'use client'

import { useState, useEffect } from 'react'
import { useFirebase } from '@/firebase'
import { apiJSON } from '@/api/client'
import { normalizeMatchPlan, type MatchPlan } from '@/api/types'

export function useMatchPlansMultiple(matchIds: string[]) {
  const { getIdToken } = useFirebase()
  const [data, setData] = useState<MatchPlan[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Use a primitive key to avoid infinite re-renders from array reference changes
  const matchIdsKey = matchIds.join(',')

  useEffect(() => {
    const ids = matchIdsKey ? matchIdsKey.split(',').filter(Boolean) : []
    if (ids.length === 0) {
      setData([])
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    Promise.all(ids.map(id => apiJSON<any[]>(`/api/matches/${id}/plans`, getIdToken)))
      .then(results => setData(results.flat().map(normalizeMatchPlan)))
      .catch(e => setError(e as Error))
      .finally(() => setIsLoading(false))
  }, [matchIdsKey, getIdToken])

  return { data, isLoading, error }
}
