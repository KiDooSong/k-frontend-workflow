// data/data-source — 원격 HTTP. 킷의 api_client role 후보지만 datasources 경로는 비표준.
import type { ProfileDTO } from '../../../api/schemas/profile.schema';

export class ProfileRemoteDataSource {
  async fetchProfile(): Promise<ProfileDTO> {
    const res = await fetch('/profile');
    return res.json();
  }
}
