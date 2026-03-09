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
