-- Duty-row confidence for JetBlue FLICA review; extends schedule_pairing_duties view.

alter table public.schedule_pairing_legs
  add column if not exists row_confidence numeric;

create or replace view public.schedule_pairing_duties as
select
  l.id,
  l.pairing_id as pairing_row_id,
  l.duty_date,
  l.calendar_day,
  l.report_time,
  l.release_time_local,
  l.duty_type_raw,
  l.is_deadhead,
  l.duty_period_minutes,
  l.flight_number,
  l.segment_type,
  l.departure_station as from_airport,
  l.arrival_station as to_airport,
  l.scheduled_departure_local as departure_time_local,
  l.scheduled_arrival_local as arrival_time_local,
  l.block_time,
  l.credit_time,
  l.layover_start,
  l.layover_end,
  l.layover_minutes,
  l.layover_city,
  l.hotel_name,
  l.hotel_phone,
  l.aircraft_position_code,
  l.red_eye_flag,
  l.transatlantic_flag,
  l.customs_connect_flag,
  l.requires_review,
  l.row_confidence,
  l.raw_text,
  l.created_at,
  l.updated_at
from public.schedule_pairing_legs l;
