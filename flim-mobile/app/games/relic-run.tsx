import { useMemo } from "react";
import { createRelicRunHtml } from "@/games/relic-run/relicRunHtml";
import { relicRunGameRegistration } from "@/games/relic-run/registry";
import { EmbeddedGameScreen } from "@/screens/EmbeddedGameScreen";

export default function RelicRunGameRoute() {
  const html = useMemo(() => createRelicRunHtml(), []);

  return (
    <EmbeddedGameScreen
      html={html}
      title={relicRunGameRegistration.title}
      footerStats={[
        { label: "Score", valueKey: "score", fallback: 0 },
        { label: "Relics", valueKey: "relics", fallback: 0 },
        { label: "Combo x", valueKey: "combo", fallback: 1 }
      ]}
    />
  );
}
