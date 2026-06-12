export interface Area {
  id: string
  parent_id?: string
  name: string
  city_count?: number
  areas?: Area[]
}

export interface BuilderState {
  regionNames: string[]
  cities: string[]
  niches: string[]
}
