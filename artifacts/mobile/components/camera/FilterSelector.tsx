import React from "react";
import { ScrollView, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { FILTERS, FilterId } from "./filterDefs";

interface Props {
  selected: FilterId;
  onSelect: (id: FilterId) => void;
}

export default function FilterSelector({ selected, onSelect }: Props) {
  return (
    <View style={st.wrapper}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={st.list}
      >
        {FILTERS.map((f) => {
          const active = f.id === selected;
          return (
            <TouchableOpacity
              key={f.id}
              onPress={() => onSelect(f.id)}
              style={st.item}
              activeOpacity={0.75}
            >
              <View
                style={[
                  st.circle,
                  { backgroundColor: f.previewColor },
                  active && st.circleActive,
                ]}
              >
                <Text style={st.icon}>{f.icon}</Text>
              </View>
              <Text style={[st.label, active && st.labelActive]} numberOfLines={1}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  wrapper: {
    position: "absolute",
    right: 4,
    top: 100,
    bottom: 140,
    width: 68,
  },
  list: {
    paddingVertical: 8,
    gap: 8,
    alignItems: "center",
  },
  item: {
    alignItems: "center",
    gap: 3,
    paddingVertical: 2,
    width: 62,
  },
  circle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.3)",
  },
  circleActive: {
    borderColor: "#fff",
    borderWidth: 3,
  },
  icon: {
    fontSize: 22,
  },
  label: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 9,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  labelActive: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
  },
});
