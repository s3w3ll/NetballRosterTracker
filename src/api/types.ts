export interface Player {
  id: string
  name: string
  position?: string
  rosterId: string
}

export interface Roster {
  id: string
  name: string
  description?: string
  playerCount: number
  players?: Player[]
  createdAt?: string
}

export interface Position {
  id: string
  name: string
  abbreviation: string
  icon?: string
  gameFormatId: string
  positionGroup?: string | null  // e.g. 'A' for A1/A2 in 6-aside; null = no grouping
}

export interface GameFormat {
  id: string
  name: string
  teamSize: number
  numberOfPeriods: number
  periodDuration: number
  isTemporary: boolean
  positions?: Position[]
}

export interface Match {
  id: string
  name?: string
  team1RosterId?: string
  team2RosterId?: string
  gameFormatId?: string
  startTime?: string
  endTime?: string
}

export interface MatchPlan {
  id: string
  matchId: string
  quarter: number
  playerPositions: Array<{ position: string; playerId: string }>
}

export interface Tournament {
  id: string
  name: string
  matchIds: string[]
  createdAt?: string
}

// --- Normalizers ---

export function normalizePlayer(raw: any): Player {
  return {
    id: raw.id,
    name: raw.name,
    position: raw.position ?? undefined,
    rosterId: raw.roster_id,
  }
}

export function normalizeRoster(raw: any): Roster {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? undefined,
    playerCount: raw.player_count ?? raw.players?.length ?? 0,
    players: raw.players ? raw.players.map(normalizePlayer) : undefined,
    createdAt: raw.created_at,
  }
}

export function normalizePosition(raw: any): Position {
  return {
    id: raw.id,
    name: raw.name,
    abbreviation: raw.abbreviation,
    icon: raw.icon ?? undefined,
    gameFormatId: raw.game_format_id,
    positionGroup: raw.position_group ?? null,
  }
}

export function normalizeGameFormat(raw: any): GameFormat {
  return {
    id: raw.id,
    name: raw.name,
    teamSize: raw.team_size,
    numberOfPeriods: raw.number_of_periods,
    periodDuration: raw.period_duration,
    isTemporary: Boolean(raw.is_temporary),
    positions: raw.positions ? raw.positions.map(normalizePosition) : undefined,
  }
}

export function normalizeMatch(raw: any): Match {
  return {
    id: raw.id,
    name: raw.name ?? undefined,
    team1RosterId: raw.team1_roster_id ?? undefined,
    team2RosterId: raw.team2_roster_id ?? undefined,
    gameFormatId: raw.game_format_id ?? undefined,
    startTime: raw.start_time ?? undefined,
    endTime: raw.end_time ?? undefined,
  }
}

export function normalizeMatchPlan(raw: any): MatchPlan {
  return {
    id: raw.id,
    matchId: raw.match_id,
    quarter: raw.quarter,
    playerPositions: raw.playerPositions ?? JSON.parse(raw.player_positions ?? '[]'),
  }
}

export interface SubEvent {
  id: string
  matchId: string
  period: number
  secondsElapsed: number
  playerId: string
  positionAbbr: string | null  // null = bench
}

export function normalizeSubEvent(raw: any): SubEvent {
  return {
    id: raw.id,
    matchId: raw.match_id,
    period: raw.period,
    secondsElapsed: raw.seconds_elapsed,
    playerId: raw.player_id,
    positionAbbr: raw.position_abbr ?? null,
  }
}

export function normalizeTournament(raw: any): Tournament {
  return {
    id: raw.id,
    name: raw.name,
    matchIds: raw.matchIds ?? [],
    createdAt: raw.created_at,
  }
}
