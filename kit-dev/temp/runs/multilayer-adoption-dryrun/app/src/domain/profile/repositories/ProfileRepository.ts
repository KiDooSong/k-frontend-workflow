// domain/repository INTERFACE — 의존성 역전 경계. data 계층이 구현. 킷에 role/게이트 없음.
import type { Profile } from '../entities/Profile';

export interface ProfileRepository {
  getProfile(): Promise<Profile>;
}
