'use client'

import { useState, useEffect, useCallback } from 'react'
import { useFirebase } from '@/firebase'
import { apiJSON } from '@/api/client'
import { normalizeMatch, type Match } from '@/api/types'

export function useMatches() {
  const { getIdToken } = useFirebase()
  const [data, setData] = useState<Match[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const rows = await apiJSON<any[]>('/api/matches', getIdToken)
      setData(rows.map(normalizeMatch))
    } catch (e) {
      setError(e as Error)
    } finally {
      setIsLoading(false)
    }
  }, [getIdToken])

  useEffect(() => { refetch() }, [refetch])

  return { data, isLoading, error, refetch }
}

export function useMatch(matchId: string | null | undefined) {
  const { getIdToken } = useFirebase()
  const [data, setData] = useState<Match | null>(null)
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
      const raw = await apiJSON<any>(`/api/matches/${matchId}`, getIdToken)
      setData(normalizeMatch(raw))
    } catch (e) {
      setError(e as Error)
    } finally {
      setIsLoading(false)
    }
  }, [matchId, getIdToken])

  useEffect(() => { refetch() }, [refetch])

  return { data, isLoading, error, refetch }
}
