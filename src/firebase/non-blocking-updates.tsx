'use client'

import { apiFetch } from '@/api/client'

type GetIdToken = () => Promise<string>

/**
 * Adds a player to a roster. Does NOT await the result.
 */
export function addPlayerNonBlocking(
  rosterId: string,
  player: { id: string; name: string; position?: string },
  getIdToken: GetIdToken
) {
  apiFetch(`/api/rosters/${rosterId}/players`, getIdToken, {
    method: 'POST',
    body: JSON.stringify(player),
  }).catch((err) => console.error('addPlayerNonBlocking failed', err))
}

/**
 * Deletes a player by ID. Does NOT await the result.
 */
export function deletePlayerNonBlocking(playerId: string, getIdToken: GetIdToken) {
  apiFetch(`/api/players/${playerId}`, getIdToken, {
    method: 'DELETE',
  }).catch((err) => console.error('deletePlayerNonBlocking failed', err))
}

/**
 * Upserts a match plan (quarter assignment). Does NOT await the result.
 */
export function upsertMatchPlanNonBlocking(
  matchId: string,
  plan: { id: string; quarter: number; playerPositions: Array<{ position: string; playerId: string }> },
  getIdToken: GetIdToken
) {
  apiFetch(`/api/matches/${matchId}/plans`, getIdToken, {
    method: 'POST',
    body: JSON.stringify(plan),
  }).catch((err) => console.error('upsertMatchPlanNonBlocking failed', err))
}

/**
 * Creates a sub event (position assignment or bench). Does NOT await the result.
 */
export function createSubEventNonBlocking(
  matchId: string,
  event: {
    id: string
    period: number
    secondsElapsed: number
    playerId: string
    positionAbbr: string | null
  },
  getIdToken: GetIdToken
) {
  apiFetch(`/api/matches/${matchId}/sub-events`, getIdToken, {
    method: 'POST',
    body: JSON.stringify(event),
  }).catch((err) => console.error('createSubEventNonBlocking failed', err))
}

/**
 * Creates multiple sub events in one request (e.g. starting lineup). Does NOT await.
 */
export function bulkCreateSubEventsNonBlocking(
  matchId: string,
  events: Array<{
    id: string
    period: number
    secondsElapsed: number
    playerId: string
    positionAbbr: string | null
  }>,
  getIdToken: GetIdToken
) {
  if (events.length === 0) return
  apiFetch(`/api/matches/${matchId}/sub-events/bulk`, getIdToken, {
    method: 'POST',
    body: JSON.stringify({ events }),
  }).catch((err) => console.error('bulkCreateSubEventsNonBlocking failed', err))
}

/**
 * Updates a sub event's time and/or position. Does NOT await.
 */
export function updateSubEventNonBlocking(
  matchId: string,
  eventId: string,
  changes: { secondsElapsed: number; positionAbbr: string | null },
  getIdToken: GetIdToken
) {
  apiFetch(`/api/matches/${matchId}/sub-events/${eventId}`, getIdToken, {
    method: 'PUT',
    body: JSON.stringify(changes),
  }).catch((err) => console.error('updateSubEventNonBlocking failed', err))
}

/**
 * Deletes a sub event. Does NOT await.
 */
export function deleteSubEventNonBlocking(
  matchId: string,
  eventId: string,
  getIdToken: GetIdToken
) {
  apiFetch(`/api/matches/${matchId}/sub-events/${eventId}`, getIdToken, {
    method: 'DELETE',
  }).catch((err) => console.error('deleteSubEventNonBlocking failed', err))
}
