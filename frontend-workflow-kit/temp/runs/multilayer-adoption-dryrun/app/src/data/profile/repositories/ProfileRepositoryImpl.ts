// data/repository IMPL — domain 인터페이스 구현. DataSource 호출 + Mapper 변환. 킷에 role/게이트 없음.
import type { Profile } from '../../../domain/profile/entities/Profile';
import type { ProfileRepository } from '../../../domain/profile/repositories/ProfileRepository';
import { ProfileRemoteDataSource } from '../datasources/ProfileRemoteDataSource';
import { toProfile } from '../mappers/ProfileMapper';

export class ProfileRepositoryImpl implements ProfileRepository {
  constructor(private readonly ds = new ProfileRemoteDataSource()) {}
  async getProfile(): Promise<Profile> {
    return toProfile(await this.ds.fetchProfile());
  }
}
