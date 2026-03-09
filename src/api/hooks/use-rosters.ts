'use client'

import { useState, useEffect, useCallback } from 'react'
import { useFirebase } from '@/firebase'
import { apiJSON } from '@/api/client'
import { normalizeRoster, type Roster } from '@/api/types'

export function useRosters() {
  const { getIdToken } = useFirebase()
  const [data, setData] = useState<Roster[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const rows = await apiJSON<any[]>('/api/rosters', getIdToken)
      setData(rows.map(normalizeRoster))
    } catch (e) {
      setError(e as Error)
    } finally {
      setIsLoading(false)
    }
  }, [getIdToken])

  useEffect(() => { refetch() }, [refetch])

  return { data, isLoading, error, refetch }
}

export function useRoster(rosterId: string | null | undefined) {
  const { getIdToken } = useFirebase()
  const [data, setData] = useState<Roster | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const refetch = useCallback(async () => {
    if (!rosterId) {
      setData(null)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const raw = await apiJSON<any>(`/api/rosters/${rosterId}`, getIdToken)
      setData(normalizeRoster(raw))
    } catch (e) {
      setError(e as Error)
    } finally {
      setIsLoading(false)
    }
  }, [rosterId, getIdToken])

  useEffect(() => { refetch() }, [refetch])

  return { data, isLoading, error, refetch }
}
