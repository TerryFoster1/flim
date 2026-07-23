import { useMemo } from "react";
import { createTriceratopsHtml } from "@/games/triceratops/triceratopsHtml";
import { triceratopsGameRegistration } from "@/games/triceratops/registry";
import { EmbeddedGameScreen } from "@/screens/EmbeddedGameScreen";

export default function TriceratopsGameRoute() {
  const html = useMemo(() => createTriceratopsHtml(), []);
  return (
    <EmbeddedGameScreen
      html={html}
      title={triceratopsGameRegistration.title}
      footerStats={[
        { label: "Score", valueKey: "score", fallback: 0 },
        { label: "Cars", valueKey: "vehiclesFlipped", fallback: 0 },
        { label: "Combo x", valueKey: "maxCombo", fallback: 1 }
      ]}
    />
  );
}
