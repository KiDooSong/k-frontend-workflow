// data/mapper — DTO(서버) → Entity(도메인) 변환 경계. 킷에 'mapper' role/게이트 없음.
import type { Profile } from '../../../domain/profile/entities/Profile';
import type { ProfileDTO } from '../../../api/schemas/profile.schema';

export function toProfile(dto: ProfileDTO): Profile {
  return { id: dto.id, name: dto.full_name, email: dto.email, tier: dto.tier };
}
