// domain/entity — 순수 도메인 모델 (DTO 아님). 킷에 'entity' role/fact/게이트 없음.
export interface Profile {
  id: string;
  name: string;
  email: string;
  tier: 'free' | 'pro';
}
