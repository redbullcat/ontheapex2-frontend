import type { LapRead, LiveLap } from '../api/types'

// Reshapes a live lap into LapRead's shape so the existing historical chart
// components (PaceChart, LapPositionChart, PitTimeChart, computeCarStints,
// ...) can be reused as-is for car-detail views in Live/Replay, instead of
// duplicating those visualizations. The four fields the live feed has no
// equivalent for (driver_number, kph, elapsed, hour, group) are left null —
// confirmed earlier that nothing in the frontend actually reads any of
// them except ResultsTable's totalTime column, which this adapter's
// callers (car-detail only) never render.
export function liveLapToLapRead(lap: LiveLap, index: number): LapRead {
  return {
    id: index,
    session_id: 0,
    car_number: lap.car_number,
    driver_number: null,
    lap_number: lap.lap_number,
    lap_time: lap.lap_time,
    lap_time_seconds: lap.lap_time_seconds,
    lap_improvement: lap.lap_improvement,
    is_valid: lap.is_valid,
    crossing_finish_line_in_pit: lap.crossing_finish_line_in_pit,
    s1: lap.s1,
    s2: lap.s2,
    s3: lap.s3,
    s1_improvement: lap.s1_improvement,
    s2_improvement: lap.s2_improvement,
    s3_improvement: lap.s3_improvement,
    s1_seconds: lap.s1_seconds,
    s2_seconds: lap.s2_seconds,
    s3_seconds: lap.s3_seconds,
    kph: null,
    elapsed: null,
    elapsed_seconds: lap.elapsed_seconds,
    hour: null,
    top_speed: lap.top_speed,
    driver_name: lap.driver_name,
    pit_time: lap.pit_time,
    pit_time_seconds: lap.pit_time_seconds,
    class: lap.class,
    group: null,
    team: lap.team,
    manufacturer: lap.manufacturer,
    flag_at_fl: lap.flag_at_fl,
  }
}
