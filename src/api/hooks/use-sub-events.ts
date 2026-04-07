'use client'

import { useState, useEffect, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useFirebase } from '@/firebase'
import { apiFetch, apiJSON } from '@/api/client'
import { normalizeSubEvent, type SubEvent } from '@/api/types'

export function useSubEvents(matchId: string | null | undefined) {
  const { getIdToken } = useFirebase()
  const [data, setData] = useState<SubEvent[] | null>(null)
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
      const rows = await apiJSON<any[]>(`/api/matches/${matchId}/sub-events`, getIdToken)
      setData(rows.map(normalizeSubEvent))
    } catch (e) {
      setError(e as Error)
    } finally {
      setIsLoading(false)
    }
  }, [matchId, getIdToken])

  useEffect(() => { refetch() }, [refetch])

  const create = useCallback(async (event: Omit<SubEvent, 'id' | 'matchId'>) => {
    if (!matchId) return undefined
    const id = uuidv4()
    await apiFetch(`/api/matches/${matchId}/sub-events`, getIdToken, {
      method: 'POST',
      body: JSON.stringify({ id, ...event }),
    })
    await refetch()
    return id
  }, [matchId, getIdToken, refetch])

  const update = useCallback(async (
    id: string,
    changes: { secondsElapsed: number; positionAbbr: string | null }
  ) => {
    if (!matchId) return
    await apiFetch(`/api/matches/${matchId}/sub-events/${id}`, getIdToken, {
      method: 'PUT',
      body: JSON.stringify(changes),
    })
    await refetch()
  }, [matchId, getIdToken, refetch])

  const remove = useCallback(async (id: string) => {
    if (!matchId) return
    await apiFetch(`/api/matches/${matchId}/sub-events/${id}`, getIdToken, {
      method: 'DELETE',
    })
    await refetch()
  }, [matchId, getIdToken, refetch])

  const bulkCreate = useCallback(async (events: Array<Omit<SubEvent, 'id' | 'matchId'>>) => {
    if (!matchId || events.length === 0) return
    await apiFetch(`/api/matches/${matchId}/sub-events/bulk`, getIdToken, {
      method: 'POST',
      body: JSON.stringify({ events: events.map(e => ({ id: uuidv4(), ...e })) }),
    })
    await refetch()
  }, [matchId, getIdToken, refetch])

  return { data, isLoading, error, refetch, create, update, remove, bulkCreate }
}
