'use client'

import { useState, useEffect, useCallback } from 'react'
import { useFirebase } from '@/firebase'
import { apiJSON } from '@/api/client'
import { normalizeTournament, type Tournament } from '@/api/types'

export function useTournaments() {
  const { getIdToken } = useFirebase()
  const [data, setData] = useState<Tournament[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const rows = await apiJSON<any[]>('/api/tournaments', getIdToken)
      setData(rows.map(normalizeTournament))
    } catch (e) {
      setError(e as Error)
    } finally {
      setIsLoading(false)
    }
  }, [getIdToken])

  useEffect(() => { refetch() }, [refetch])

  return { data, isLoading, error, refetch }
}

export function useTournament(tournamentId: string | null | undefined) {
  const { getIdToken } = useFirebase()
  const [data, setData] = useState<Tournament | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const refetch = useCallback(async () => {
    if (!tournamentId) {
      setData(null)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const raw = await apiJSON<any>(`/api/tournaments/${tournamentId}`, getIdToken)
      setData(normalizeTournament(raw))
    } catch (e) {
      setError(e as Error)
    } finally {
      setIsLoading(false)
    }
  }, [tournamentId, getIdToken])

  useEffect(() => { refetch() }, [refetch])

  return { data, isLoading, error, refetch }
}
