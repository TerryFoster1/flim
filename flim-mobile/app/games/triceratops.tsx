import { useMemo } from "react";
import { createTriceratopsHtml } from "@/games/triceratops/triceratopsHtml";
import { triceratopsGameRegistration } from "@/games/triceratops/registry";
import { EmbeddedGameScreen } from "@/screens/EmbeddedGameScreen";

export default function TriceratopsGameRoute() {
  const html = useMemo(() => createTriceratopsHtml(), []);
  return <EmbeddedGameScreen html={html} title={triceratopsGameRegistration.title} />;
}
