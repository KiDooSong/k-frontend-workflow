// domain/use-case — 비즈니스 규칙. 킷에 'usecase' role/fact/게이트 없음.
import type { Profile } from '../entities/Profile';
import type { ProfileRepository } from '../repositories/ProfileRepository';

export class GetProfileUseCase {
  constructor(private readonly repo: ProfileRepository) {}
  async execute(): Promise<Profile> {
    return this.repo.getProfile();
  }
}
