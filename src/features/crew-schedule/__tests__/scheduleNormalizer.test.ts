/**
 * J3H95 structural test — FLICA-style leg rows as the parser would emit (D-END duty groups).
 * Run: npx tsx src/features/crew-schedule/__tests__/scheduleNormalizer.test.ts
 */
import assert from 'assert';
import type { FlicaLeg, FlicaPairing } from '../../../services/flicaScheduleHtmlParser';
import { normalizeFlicaParsedPairing } from '../scheduleNormalizer';

function leg(p: Partial<FlicaLeg> & Pick<FlicaLeg, 'route' | 'date' | 'dutyPeriodDate'>): FlicaLeg {
  return {
    dayOfWeek: p.dayOfWeek ?? 'WE',
    date: p.date,
    flightNumber: p.flightNumber ?? '1',
    route: p.route,
    departLocal: p.departLocal ?? '1200',
    arriveLocal: p.arriveLocal ?? '1400',
    blockTime: p.blockTime ?? '0200',
    equipment: p.equipment ?? '32S',
    isDeadhead: p.isDeadhead ?? false,
    layoverCity: p.layoverCity ?? '',
    layoverTime: p.layoverTime ?? '',
    hotel: p.hotel ?? '',
    hotelPhone: p.hotelPhone ?? '',
    nextReportTime: p.nextReportTime ?? '',
    dEndLocal: p.dEndLocal ?? '',
    dutyPeriodDay: p.dutyPeriodDay ?? 'WE',
    dutyPeriodDate: p.dutyPeriodDate,
    dutyOffTime: p.dutyOffTime ?? '',
  };
}

const j3h95Pairing: FlicaPairing = {
  id: 'J3H95',
  startDate: '2026-04-22',
  endDate: '2026-04-24',
  baseReport: '0500L',
  daysOfWeek: 'WE TH FR',
  operatingDates: 'Apr 22-Apr 24',
  base: 'JFK',
  equipment: 'ALL',
  positions: 'F1',
  totalBlock: '1812',
  totalDeadhead: '0000',
  totalCredit: '1812',
  tafb: '5200',
  crewMembers: [],
  legs: [
    leg({
      route: 'JFK-LAS',
      dayOfWeek: 'WE',
      date: 22,
      dutyPeriodDay: 'WE',
      dutyPeriodDate: 22,
      departLocal: '0800',
      arriveLocal: '1200',
      flightNumber: '101',
    }),
    leg({
      route: 'LAS-BOS',
      dayOfWeek: 'WE',
      date: 22,
      dutyPeriodDay: 'WE',
      dutyPeriodDate: 22,
      departLocal: '1400',
      arriveLocal: '2000',
      layoverCity: 'BOS',
      layoverTime: '2355',
      hotel: 'Boston Layover',
      nextReportTime: '0600L',
      dEndLocal: '1812L',
      dutyOffTime: '1812',
    }),
    leg({
      route: 'BOS-LAS',
      dayOfWeek: 'TH',
      date: 23,
      dutyPeriodDay: 'TH',
      dutyPeriodDate: 23,
      departLocal: '1926',
      arriveLocal: '2200',
      flightNumber: '202',
    }),
    leg({
      route: 'LAS-JFK',
      dayOfWeek: 'FR',
      date: 24,
      dutyPeriodDay: 'TH',
      dutyPeriodDate: 23,
      departLocal: '0009',
      arriveLocal: '0005',
      flightNumber: '303',
      nextReportTime: '0500L',
      dEndLocal: '0741L',
      dutyOffTime: '0741',
    }),
  ],
};

function run() {
  const trip = normalizeFlicaParsedPairing(j3h95Pairing);
  const d22 = trip.dutyDays.find((d) => d.dutyDateIso === '2026-04-22');
  const d23 = trip.dutyDays.find((d) => d.dutyDateIso === '2026-04-23');
  assert(d22, 'expected Apr 22 duty day');
  assert(d23, 'expected Apr 23 duty day');
  assert.strictEqual(d22!.layoverCity, 'BOS', 'Apr 22 layover city BOS');
  assert.strictEqual(d22!.layoverTime, '2355', 'Apr 22 layover time 2355');
  const routesD23 = d23!.legs.map((L) => `${L.depAirport}-${L.arrAirport}`).join(',');
  assert(routesD23.includes('BOS-LAS') && routesD23.includes('LAS-JFK'), 'Apr 23 must contain BOS-LAS and LAS-JFK');
  const lasJfk = d23!.legs.find((L) => L.depAirport === 'LAS' && L.arrAirport === 'JFK');
  assert(lasJfk, 'LAS-JFK leg');
  assert.strictEqual(lasJfk!.dutyDateIso, '2026-04-23', 'LAS-JFK duty on Apr 23');
  assert.strictEqual(lasJfk!.actualDepDateIso, '2026-04-24', 'LAS-JFK row DD is Apr 24');
  assert.strictEqual(d23!.isOvernightDuty, true, 'overnight to base on last leg');
  console.log('scheduleNormalizer J3H95: OK', {
    days: trip.dutyDays.length,
    d23routes: d23!.legs.map((L) => `${L.depAirport}-${L.arrAirport}`),
  });
}

run();
