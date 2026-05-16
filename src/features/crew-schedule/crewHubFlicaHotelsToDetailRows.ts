import type { FlicaPairingHotel } from "../../services/flicaScheduleHtmlParser";
import type { PairingDetailDbHotelRow } from "./scheduleApi";

export function flicaPairingHotelsToDetailRows(hotels: FlicaPairingHotel[]): PairingDetailDbHotelRow[] {
  return hotels.map((h, i) => ({
    id: `flica-html-${i}-${h.dutyDateIso ?? "na"}`,
    duty_date: h.dutyDateIso,
    layover_city: h.layoverCity,
    hotel_name: h.hotelName,
    hotel_phone: h.hotelPhone,
    nights: h.nights,
    raw_text: h.rawText,
  }));
}
