// presentation/screen (View) — depends only on ViewModel's AsyncState
import { View, Text } from 'react-native';
import { useProfileViewModel } from '../viewmodels/useProfileViewModel';
import { ProfileHeader } from '../components/ProfileHeader';

export function ProfileScreen() {
  const vm = useProfileViewModel();
  if (vm.status === 'loading') return <Text>Loading…</Text>;
  if (vm.status === 'error') return <Text>Error</Text>;
  return (
    <View>
      <ProfileHeader name={vm.profile?.name ?? ''} />
    </View>
  );
}
