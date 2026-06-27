// presentation/view-model — orchestrates use-cases, exposes AsyncState to the View.
// (Clean Architecture 의 핵심 계층. 킷에는 'view_model' role 이 없어 hook role 로 매핑됨.)
import { useState } from 'react';
import type { AsyncState } from '../../../lib/asyncState';
import type { Profile } from '../../../domain/profile/entities/Profile';
import { GetProfileUseCase } from '../../../domain/profile/usecases/GetProfileUseCase';

type ProfileVM = AsyncState & { profile: Profile | null };

export function useProfileViewModel(): ProfileVM {
  const [state] = useState<ProfileVM>({ status: 'loading', profile: null });
  // 실제로는 GetProfileUseCase 를 호출해 상태를 채운다.
  void GetProfileUseCase;
  return state;
}
