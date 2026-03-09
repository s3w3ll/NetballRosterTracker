'use client'

import { useState, useEffect, useCallback } from 'react'
import { useFirebase } from '@/firebase'
import { apiJSON } from '@/api/client'
import { normalizeMatchPlan, type MatchPlan } from '@/api/types'

export function useMatchPlans(matchId: string | null | undefined) {
  const { getIdToken } = useFirebase()
  const [data, setData] = useState<MatchPlan[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const refetch = useCallback(async () => {
    if (!matchId) {
      setData(null)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const rows = await apiJSON<any[]>(`/api/matches/${matchId}/plans`, getIdToken)
      setData(rows.map(normalizeMatchPlan))
    } catch (e) {
      setError(e as Error)
    } finally {
      setIsLoading(false)
    }
  }, [matchId, getIdToken])

  useEffect(() => { refetch() }, [refetch])

  return { data, isLoading, error, refetch }
}
