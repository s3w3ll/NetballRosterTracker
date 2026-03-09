'use client'

import { useState, useEffect, useCallback } from 'react'
import { useFirebase } from '@/firebase'
import { apiJSON } from '@/api/client'
import { normalizeGameFormat, type GameFormat } from '@/api/types'

export function useGameFormats() {
  const { getIdToken } = useFirebase()
  const [data, setData] = useState<GameFormat[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const rows = await apiJSON<any[]>('/api/game-formats', getIdToken)
      setData(rows.map(normalizeGameFormat))
    } catch (e) {
      setError(e as Error)
    } finally {
      setIsLoading(false)
    }
  }, [getIdToken])

  useEffect(() => { refetch() }, [refetch])

  return { data, isLoading, error, refetch }
}

export function useGameFormat(formatId: string | null | undefined) {
  const { getIdToken } = useFirebase()
  const [data, setData] = useState<GameFormat | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const refetch = useCallback(async () => {
    if (!formatId) {
      setData(null)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const raw = await apiJSON<any>(`/api/game-formats/${formatId}`, getIdToken)
      setData(normalizeGameFormat(raw))
    } catch (e) {
      setError(e as Error)
    } finally {
      setIsLoading(false)
    }
  }, [formatId, getIdToken])

  useEffect(() => { refetch() }, [refetch])

  return { data, isLoading, error, refetch }
}
