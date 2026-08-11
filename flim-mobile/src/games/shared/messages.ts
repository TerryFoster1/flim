export function isEmbeddedGameMessage(value: unknown): value is { type: string; payload: Record<string, unknown> } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybeMessage = value as { type?: unknown; payload?: unknown };
  return typeof maybeMessage.type === "string" && !!maybeMessage.payload && typeof maybeMessage.payload === "object";
}

