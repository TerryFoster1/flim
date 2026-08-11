import { useMemo } from "react";
import { createRelicRunHtml } from "@/games/relic-run/relicRunHtml";
import { RELIC_RUN_GAME_ID } from "@/games/relic-run/config";
import { relicRunGameRegistration } from "@/games/relic-run/registry";
import { EmbeddedGameScreen } from "@/screens/EmbeddedGameScreen";

export default function RelicRunGameRoute() {
  const html = useMemo(() => createRelicRunHtml(), []);

  return (
    <EmbeddedGameScreen
      html={html}
      title={relicRunGameRegistration.title}
      backlotGameId={RELIC_RUN_GAME_ID}
      footerStats={[
        { label: "Score", valueKey: "score", fallback: 0 },
        { label: "Relics", valueKey: "relics", fallback: 0 },
        { label: "Combo x", valueKey: "combo", fallback: 1 }
      ]}
    />
  );
}
