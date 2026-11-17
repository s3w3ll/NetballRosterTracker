'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useFirebase } from '@/firebase'
import { apiFetch, apiJSON } from '@/api/client'
import { normalizeSubEvent, type SubEvent } from '@/api/types'

type NewSubEvent = Omit<SubEvent, 'id' | 'matchId'>

/** apiFetch resolves on HTTP errors — turn non-2xx into a thrown Error so callers can react. */
async function ensureOk(res: Response): Promise<void> {
  if (res.ok) return
  const body = await res.json().catch(() => ({}))
  throw new Error((body as any).error || `HTTP ${res.status}`)
}

export function useSubEvents(matchId: string | null | undefined) {
  const { getIdToken } = useFirebase()
  const [data, setData] = useState<SubEvent[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const hasLoaded = useRef(false)
  // Optimistic rows whose POST hasn't resolved yet — kept across refetches.
  const pendingIds = useRef(new Set<string>())
  // Only the most recently issued refetch may write `data`, so a slow, older
  // response can't overwrite a newer one and drop a just-recorded sub.
  const fetchSeq = useRef(0)

  const refetch = useCallback(async () => {
    if (!matchId) {
      setData(null)
      setIsLoading(false)
      return
    }
    // Only show the loading state on first load — background refreshes after
    // each edit shouldn't flash skeletons over the court.
    if (!hasLoaded.current) setIsLoading(true)
    setError(null)
    const seq = ++fetchSeq.current
    try {
      const rows = await apiJSON<any[]>(`/api/matches/${matchId}/sub-events`, getIdToken)
      if (seq !== fetchSeq.current) return
      const server = rows.map(normalizeSubEvent)
      const serverIds = new Set(server.map(e => e.id))
      setData(prev => [
        ...server,
        ...(prev ?? []).filter(e => pendingIds.current.has(e.id) && !serverIds.has(e.id)),
      ])
      hasLoaded.current = true
    } catch (e) {
      setError(e as Error)
    } finally {
      setIsLoading(false)
    }
  }, [matchId, getIdToken])

  useEffect(() => {
    hasLoaded.current = false
    refetch()
  }, [refetch])

  /** Inserts optimistically, rolls back and rethrows if the server rejects. */
  const insert = useCallback(async (events: Array<NewSubEvent & { id: string }>, path: string, body: unknown) => {
    if (!matchId) return
    const ids = new Set(events.map(e => e.id))
    ids.forEach(id => pendingIds.current.add(id))
    setData(prev => [...(prev ?? []), ...events.map(e => ({ ...e, matchId }))])
    try {
      await ensureOk(await apiFetch(path, getIdToken, { method: 'POST', body: JSON.stringify(body) }))
    } catch (e) {
      setData(prev => (prev ?? []).filter(ev => !ids.has(ev.id)))
      throw e
    } finally {
      ids.forEach(id => pendingIds.current.delete(id))
    }
    await refetch()
  }, [matchId, getIdToken, refetch])

  const create = useCallback(async (event: NewSubEvent) => {
    if (!matchId) return undefined
    const withId = { id: uuidv4(), ...event }
    await insert([withId], `/api/matches/${matchId}/sub-events`, withId)
    return withId.id
  }, [matchId, insert])

  const bulkCreate = useCallback(async (events: NewSubEvent[]) => {
    if (!matchId || events.length === 0) return
    const withIds = events.map(e => ({ id: uuidv4(), ...e }))
    await insert(withIds, `/api/matches/${matchId}/sub-events/bulk`, { events: withIds })
  }, [matchId, insert])

  const update = useCallback(async (
    id: string,
    changes: { secondsElapsed: number; positionAbbr: string | null }
  ) => {
    if (!matchId) return
    await ensureOk(await apiFetch(`/api/matches/${matchId}/sub-events/${id}`, getIdToken, {
      method: 'PUT',
      body: JSON.stringify(changes),
    }))
    await refetch()
  }, [matchId, getIdToken, refetch])

  const remove = useCallback(async (id: string) => {
    if (!matchId) return
    await ensureOk(await apiFetch(`/api/matches/${matchId}/sub-events/${id}`, getIdToken, {
      method: 'DELETE',
    }))
    await refetch()
  }, [matchId, getIdToken, refetch])

  /** Atomically replaces this match's planned starting lineups; live (actual) events are untouched. */
  const replacePlanLineups = useCallback(async (lineups: Array<{ period: number; playerId: string; positionAbbr: string }>) => {
    if (!matchId) return
    await ensureOk(await apiFetch(`/api/matches/${matchId}/sub-events/plan-lineups`, getIdToken, {
      method: 'PUT',
      body: JSON.stringify({ events: lineups.map(e => ({ id: uuidv4(), ...e })) }),
    }))
    await refetch()
  }, [matchId, getIdToken, refetch])

  return { data, isLoading, error, refetch, create, update, remove, bulkCreate, replacePlanLineups }
}
