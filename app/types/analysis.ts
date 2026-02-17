// --- Shared types for relationship, AI-chat, and face analysis features ---

/** Relationship (KakaoTalk) analysis */
export type RelationshipType = 'romantic' | 'friend' | 'family' | 'colleague';

export interface RelationshipFormState {
  text: string;
  analysisType: RelationshipType;
  anonymize: boolean;
  consentChecked: boolean;
}

export interface RelationshipMetrics {
  totalMessages: number;
  period: string;
  initiationRate: { you: number; partner: number };
  responseTime: { you: string; partner: string };
  emotionalTone: { positive: number; neutral: number; negative: number };
}

export interface RelationshipApiSuccess {
  success: true;
  result: {
    summary: string;
    metrics: RelationshipMetrics;
    insights: string[];
    recommendations: string[];
  };
}

/** AI-chat analysis */
export type AiChatPeriod = 'all' | '1month' | '3months';

export interface AiChatFormState {
  text: string;
  period: AiChatPeriod;
  consentChecked: boolean;
}

export interface AiChatTopic {
  category: string;
  percentage: number;
}

export interface AiChatApiSuccess {
  success: true;
  result: {
    summary: string;
    topics: AiChatTopic[];
    patterns: string[];
    insights: string;
    recommendations: string[];
  };
}

/** Face (관상) analysis */
export interface FaceFormState {
  imagePreview: string | null;
  consentChecked: boolean;
}

export interface FaceApiSuccess {
  success: true;
  result: {
    summary: string;
    features: {
      eyes: string;
      nose: string;
      mouth: string;
      overall: string;
    };
    energy: string;
    personality: string[];
    disclaimer: string;
  };
}

/** Generic error shape shared by all endpoints */
export interface AnalysisApiError {
  success: false;
  error: string;
}

export type RelationshipApiResponse = RelationshipApiSuccess | AnalysisApiError;
export type AiChatApiResponse = AiChatApiSuccess | AnalysisApiError;
export type FaceApiResponse = FaceApiSuccess | AnalysisApiError;
