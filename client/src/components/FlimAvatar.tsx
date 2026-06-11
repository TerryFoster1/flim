import { getFlimAvatar } from "../avatarCatalog";
import type { CSSProperties } from "react";

interface FlimAvatarProps {
  avatarKey?: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  frame?: string;
}

export function FlimAvatar({ avatarKey, label = "Flim avatar", size = "md", frame }: FlimAvatarProps) {
  const avatar = getFlimAvatar(avatarKey);

  return (
    <span
      className={`flim-avatar flim-avatar-${size} ${frame ? `flim-avatar-frame-${frame}` : ""}`}
      aria-label={`${label}: ${avatar.name}`}
      role="img"
      style={{
        "--avatar-a": avatar.colors[0],
        "--avatar-b": avatar.colors[1],
      } as CSSProperties}
      title={avatar.name}
    >
      <span className={`flim-avatar-icon flim-avatar-icon-${avatar.icon}`} aria-hidden="true" />
    </span>
  );
}
