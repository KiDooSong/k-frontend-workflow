import { Pressable, Text, View } from 'react-native';

type Item = { key: string; label: string };
type Props = {
  items: Item[];
  value: string;
  onChange: (key: string) => void;
};

export function SegmentedTabs({ items, value, onChange }: Props) {
  return (
    <View accessibilityRole="tablist">
      {items.map((it) => (
        <Pressable
          key={it.key}
          accessibilityRole="tab"
          accessibilityState={{ selected: it.key === value }}
          onPress={() => onChange(it.key)}
        >
          <Text>{it.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
