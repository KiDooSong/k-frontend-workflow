// ui_primitive — 공통 컴포넌트 (catalog-gen 의 정본 src/components/ui/**)
import { Pressable, Text } from 'react-native';

export function Button({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <Text>{title}</Text>
    </Pressable>
  );
}
