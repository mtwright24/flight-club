/** Native Flight Club view of FLICA RBCPair / rbcpair marketplace pairing detail HTML. */
export type FlicaMarketplacePairingDetail = {
  source: "tradeboard" | "opentime";
  sourceBadge: "Tradeboard" | "Open Time";

  pairingId: string;
  dateLabel: string;
  dateRangeLabel: string;
  daysLabel: string;
  operatingDates?: string;

  routeSummary: string;
  base: string;
  equipment: string;
  positions: string;

  reportTime: string;
  totalCredit: string;
  totalBlock: string;
  tafb: string;
  dutyFdp?: string;
  dEnd?: string;
  totalDeadhead?: string;

  dutyDays: Array<{
    dayLabel: string;
    dateLabel: string;
    reportTime?: string;
    legs: Array<{
      isDeadhead: boolean;
      deadheadType?: "DH" | "LIMO";
      flightNumber: string;
      route: string;
      departLocal: string;
      arriveLocal: string;
      blockTime: string;
      equipment?: string;
    }>;
    layover?: {
      city: string;
      duration: string;
      hotelName?: string;
      hotelPhone?: string;
      nextReportTime?: string;
      dEndLocal?: string;
    };
  }>;

  crewMembers: Array<{
    position: string;
    employeeId: string;
    name: string;
    status?: string;
  }>;

  rawHtml?: string;
  rawText?: string;
};
