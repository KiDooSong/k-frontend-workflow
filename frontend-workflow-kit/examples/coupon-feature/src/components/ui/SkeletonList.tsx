import { View } from 'react-native';

type Props = { count?: number };

export function SkeletonList({ count = 3 }: Props) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="로딩 중">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} />
      ))}
    </View>
  );
}
