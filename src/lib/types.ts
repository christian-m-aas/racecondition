export interface Driver {
  id: number
  name: string
  nickname: string | null
  photo_url: string | null
  is_active: boolean
}

export interface Track {
  id: number
  name: string
  location: string | null
  svg_url: string | null
}

export interface Race {
  id: number
  name: string
  track_id: number
  race_date: string
  description: string | null
}

export interface Heat {
  id: number
  race_id: number
  heat_number: number
  name: string | null
}

export interface Result {
  id: number
  race_id: number
  driver_id: number
  heat_id: number | null
  position: number | null
  best_lap_time_ms: number | null
  average_lap_time_ms: number | null
  dnf: boolean
  average_speed: number | null
  kart_number: number | null
}

export interface Crash {
  id: number
  race_id: number
  driver_id: number
  lap_number: number | null
  x: number
  y: number
  turn_name: string | null
  description: string | null
}

export interface Photo {
  id: number
  race_id: number
  image_url: string
  caption: string | null
  sort_order: number | null
}

export interface Data {
  drivers: Driver[]
  tracks: Track[]
  races: Race[]
  heats: Heat[]
  results: Result[]
  crashes: Crash[]
  photos: Photo[]
}
