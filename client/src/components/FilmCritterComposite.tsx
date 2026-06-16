import type { BaseAvatar, AvatarSkin } from "../avatarCatalog";

interface FilmCritterCompositeProps {
  avatar: BaseAvatar;
  skin?: AvatarSkin | null;
  locked?: boolean;
  label?: string;
}

export function FilmCritterComposite({ avatar, skin, locked = false, label }: FilmCritterCompositeProps) {
  const accessibleLabel = label || (skin ? `${avatar.name} wearing ${skin.name}` : avatar.name);

  return (
    <span className={skin ? "film-critter-composite has-skin" : "film-critter-composite"} aria-label={accessibleLabel} role="img">
      <img
        className={skin ? "film-critter-layer film-critter-face-layer" : "film-critter-layer film-critter-base-layer"}
        src={avatar.imagePath}
        alt=""
        loading="lazy"
        decoding="async"
      />
      {skin ? <img className="film-critter-layer film-critter-skin-layer" src={skin.imagePath} alt="" loading="lazy" decoding="async" /> : null}
      {locked ? <span className="avatar-skin-lock" aria-hidden="true" /> : null}
    </span>
  );
}
