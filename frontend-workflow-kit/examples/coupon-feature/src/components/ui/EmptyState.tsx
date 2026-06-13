import { Text, View } from 'react-native';

type Props = { title: string; description?: string; icon?: string };

export function EmptyState({ title, description }: Props) {
  return (
    <View>
      <Text>{title}</Text>
      {description ? <Text>{description}</Text> : null}
    </View>
  );
}
