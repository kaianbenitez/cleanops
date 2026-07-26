export type ReportRange = {
  fromIso: string;
  toIso: string;
  timeZone: string;
};

export type ReportOperationsCounts = {
  unassigned: number;
  missingHours: number;
  awaitingInvoicing: number;
};

export type CustomerHealthCounts = {
  missingPaymentMethod: number;
  incompleteNotes: number;
};
