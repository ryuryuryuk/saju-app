// Kakao OpenBuilder Skill API v2 types

export interface KakaoUser {
  id: string;
  type: string;
  properties?: Record<string, string>;
}

export interface KakaoUserRequest {
  utterance: string;
  user: KakaoUser;
  callbackUrl?: string;
  lang?: string;
  timezone?: string;
}

export interface KakaoSkillRequest {
  version: string;
  userRequest: KakaoUserRequest;
  contexts?: unknown[];
  bot?: { id: string; name: string };
  action?: { id: string; name: string; params?: Record<string, unknown> };
}

export interface KakaoSimpleText {
  text: string;
}

export interface KakaoOutput {
  simpleText?: KakaoSimpleText;
}

export interface KakaoSkillResponse {
  version: '2.0';
  template: {
    outputs: KakaoOutput[];
  };
}

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}
