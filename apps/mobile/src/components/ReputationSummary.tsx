import { Text, View } from "react-native";
import {
  REVIEW_STAR_LEVELS,
  isReviewDistribution,
  type ReviewDistribution,
} from "@omini/shared";
import { theme } from "../theme";
import { ui } from "./ui";

/** Presentation only. Distribution and mean are provided by the backend. */
export function ReputationSummary({
  average,
  total,
  distribution,
}: {
  average: number;
  total: number;
  distribution?: ReviewDistribution;
}) {
  return (
    <View style={ui.group}>
      <Text style={[ui.text, { lineHeight: 40, color: theme.colors.ink }]}>
        <Text
          style={{ fontSize: 32, lineHeight: 40, fontFamily: theme.fonts.bold }}
        >
          {average.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ⭐
        </Text>
        {" · "}
        {total} {total === 1 ? "avaliação recebida" : "avaliações recebidas"}
      </Text>
      {isReviewDistribution(distribution, total) && total > 0 && (
        <View style={ui.group}>
          <Text style={ui.small}>Distribuição das avaliações</Text>
          {REVIEW_STAR_LEVELS.map((stars) => {
            const count = distribution.find(
              (item) => item.stars === stars,
            )!.count;
            const percent = (count / total) * 100;
            return (
              <View
                key={stars}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: theme.space.sm,
                  flexWrap: "wrap",
                }}
              >
                <Text style={ui.small}>{stars} ⭐</Text>
                <View
                  accessible
                  accessibilityRole="progressbar"
                  accessibilityLabel={`${stars} ${stars === 1 ? "estrela" : "estrelas"}`}
                  accessibilityValue={{
                    min: 0,
                    max: total,
                    now: count,
                    text: `${count} ${count === 1 ? "avaliação" : "avaliações"} de ${total}`,
                  }}
                  style={{
                    flex: 1,
                    minWidth: 80,
                    height: 8,
                    borderRadius: 4,
                    overflow: "hidden",
                    backgroundColor: theme.colors.border,
                  }}
                >
                  <View
                    style={{
                      width: `${percent}%`,
                      height: "100%",
                      backgroundColor: theme.colors.accent,
                    }}
                  />
                </View>
                <Text style={ui.small}>{count}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
