import { getFlimAvatar } from "../avatarCatalog";

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
      title={avatar.name}
    >
      <img src={avatar.imagePath} alt="" aria-hidden="true" loading="lazy" decoding="async" />
    </span>
  );
}
