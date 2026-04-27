import type { DateRange } from '@daywatch/cal';

export type RangeValidationMode = 'lenient' | 'strict';

export type RangeValidationIssueCode = 'required' | 'disabled' | 'foul' | 'invalid' | 'unknown_key';

export interface RangeValidationIssue {
  code: RangeValidationIssueCode;
  field: keyof DateRange | '$';
  message: string;
}

export interface RangeValidationOptions {
  mode?: RangeValidationMode;
}

export type SanitizedRangeCandidate = Partial<DateRange>;

export type RangeValidationSuccess = {
  ok: true;
  candidate: SanitizedRangeCandidate;
  issues: [];
};

export type RangeValidationFailure = {
  ok: false;
  candidate: SanitizedRangeCandidate;
  issues: [RangeValidationIssue, ...RangeValidationIssue[]];
};

export type RangeValidationResult = RangeValidationSuccess | RangeValidationFailure;

export type DateRangeInput = Partial<DateRange> & Record<string, unknown>;

export type IndexedRangeValidationResult = RangeValidationResult & {
  index: number;
};
