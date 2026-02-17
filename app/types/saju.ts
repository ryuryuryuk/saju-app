export interface SajuFormData {
  birthYear: string;
  birthMonth: string;
  birthDay: string;
  birthTime: string;
  meridiem: '오전' | '오후';
  gender: '여성' | '남성';
  question: string;
}

export interface SajuConvertedTime {
  birthHour: string;
  birthMinute: string;
}

export interface DayMasterStrength {
  label: string;
  score: number;
}

export interface DayMasterInfo {
  stem: string;
  element: string;
  strength: DayMasterStrength;
}

export interface MonthSupportInfo {
  season: string;
  branch: string;
  element: string;
}

interface StemElementItem {
  stem: string;
  element: string;
}

interface BranchElementItem {
  branch: string;
  element: string;
}

export interface StemElements {
  year: StemElementItem;
  month: StemElementItem;
  day: StemElementItem;
  hour: StemElementItem;
}

export interface BranchElements {
  year: BranchElementItem;
  month: BranchElementItem;
  day: BranchElementItem;
  hour: BranchElementItem;
}

export interface SajuInfo {
  fullString: string;
  dayMaster: DayMasterInfo;
  monthSupport: MonthSupportInfo;
  stemElements: StemElements;
  branchElements: BranchElements;
}

export interface SajuApiSuccess {
  success: true;
  result: string;
  sajuInfo: SajuInfo;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface SajuApiError {
  success: false;
  error: string;
}

export type SajuApiResponse = SajuApiSuccess | SajuApiError;

export interface LoadingStep {
  title: string;
  description: string;
  startAtMs: number;
}
