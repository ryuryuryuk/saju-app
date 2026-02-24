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
  block?: { id: string; name: string };
  params?: Record<string, string>;
}

export interface KakaoSkillRequest {
  version: string;
  userRequest: KakaoUserRequest;
  contexts?: KakaoContext[];
  bot?: { id: string; name: string };
  action?: {
    id: string;
    name: string;
    params?: Record<string, string>;
    detailParams?: Record<string, { origin: string; value: string; groupName?: string }>;
    clientExtra?: Record<string, unknown>;
  };
}

// --- Response types ---

export interface KakaoQuickReply {
  label: string;
  action: 'message' | 'block';
  messageText?: string;
  blockId?: string;
}

export interface KakaoButton {
  label: string;
  action: 'webLink' | 'message' | 'block' | 'share' | 'phone';
  webLinkUrl?: string;
  messageText?: string;
  blockId?: string;
  phoneNumber?: string;
}

export interface KakaoSimpleText {
  text: string;
}

export interface KakaoTextCard {
  title?: string;
  description: string;
  buttons?: KakaoButton[];
}

export interface KakaoBasicCard {
  title?: string;
  description?: string;
  thumbnail?: {
    imageUrl: string;
    link?: { web?: string };
  };
  buttons?: KakaoButton[];
}

export interface KakaoOutput {
  simpleText?: KakaoSimpleText;
  textCard?: KakaoTextCard;
  basicCard?: KakaoBasicCard;
}

export interface KakaoTemplate {
  outputs: KakaoOutput[];
  quickReplies?: KakaoQuickReply[];
}

export interface KakaoSkillResponse {
  version: '2.0';
  template: KakaoTemplate;
  context?: { values: KakaoContextValue[] };
  data?: Record<string, unknown>;
}

export interface KakaoCallbackAck {
  version: '2.0';
  useCallback: true;
}

export interface KakaoContext {
  name: string;
  lifeSpan: number;
  ttl?: number;
  params?: Record<string, string>;
}

export interface KakaoContextValue {
  name: string;
  lifeSpan: number;
  ttl?: number;
  params?: Record<string, string>;
}

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}
