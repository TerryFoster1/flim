import { useEffect, useMemo, useState } from "react";
import type { BaseAvatar, AvatarSkin } from "../avatarCatalog";
import { filmCritterRig, filmCritterRigAssets } from "../avatarRig";
import { FilmCritterComposite } from "../components/FilmCritterComposite";

type AssetStatus = "loading" | "valid" | "invalid";

interface AssetCheck {
  status: AssetStatus;
  width?: number;
  height?: number;
}

function assetKey(kind: "base" | "skin", id: string) {
  return `${kind}:${id}`;
}

function validateDimensions(width: number, height: number) {
  return width === filmCritterRig.canvas.width && height === filmCritterRig.canvas.height;
}

function useAssetChecks(avatars: BaseAvatar[], skins: AvatarSkin[]) {
  const [checks, setChecks] = useState<Record<string, AssetCheck>>({});

  useEffect(() => {
    let active = true;
    const assets = [
      ...avatars.map((avatar) => ({ key: assetKey("base", avatar.id), path: avatar.imagePath })),
      ...skins.map((skin) => ({ key: assetKey("skin", skin.id), path: skin.imagePath })),
    ];

    setChecks(Object.fromEntries(assets.map((asset) => [asset.key, { status: "loading" as const }])));

    assets.forEach((asset) => {
      const image = new Image();
      image.onload = () => {
        if (!active) return;
        setChecks((current) => ({
          ...current,
          [asset.key]: {
            status: validateDimensions(image.naturalWidth, image.naturalHeight) ? "valid" : "invalid",
            width: image.naturalWidth,
            height: image.naturalHeight,
          },
        }));
      };
      image.onerror = () => {
        if (!active) return;
        setChecks((current) => ({
          ...current,
          [asset.key]: { status: "invalid" },
        }));
      };
      image.src = asset.path;
    });

    return () => {
      active = false;
    };
  }, [avatars, skins]);

  return checks;
}

function AssetBadge({ check }: { check?: AssetCheck }) {
  if (!check || check.status === "loading") return <span className="rig-badge is-loading">Checking</span>;
  if (check.status === "valid") return <span className="rig-badge is-valid">1024</span>;
  const size = check.width && check.height ? `${check.width}x${check.height}` : "Invalid";
  return <span className="rig-badge is-invalid">{size}</span>;
}

export function FilmCritterRig() {
  const avatars = filmCritterRigAssets.baseAvatars;
  const skins = filmCritterRigAssets.skins;
  const checks = useAssetChecks(avatars, skins);
  const invalidCount = useMemo(() => Object.values(checks).filter((check) => check.status === "invalid").length, [checks]);

  return (
    <section className="route-page film-critter-rig-page">
      <div className="page-heading">
        <p className="eyebrow">Film Critter rig</p>
        <h1>Avatar and skin validation</h1>
        <p>
          This page renders the canonical two-layer rig only: base avatar PNG, then skin PNG overlay. No per-avatar
          offsets, per-skin offsets, cropping, stretching, or compensation are applied.
        </p>
      </div>

      <section className="settings-panel rig-spec-panel">
        <div className="settings-panel-heading">
          <h2>Canonical geometry</h2>
        </div>
        <dl className="rig-spec-grid">
          <div><dt>Canvas</dt><dd>{filmCritterRig.canvas.width} x {filmCritterRig.canvas.height}</dd></div>
          <div><dt>Head center</dt><dd>{filmCritterRig.anchors.headCenter.x}, {filmCritterRig.anchors.headCenter.y}</dd></div>
          <div><dt>Face center</dt><dd>{filmCritterRig.anchors.faceCenter.x}, {filmCritterRig.anchors.faceCenter.y}</dd></div>
          <div><dt>Eye line</dt><dd>Y {filmCritterRig.anchors.eyeLineY}</dd></div>
          <div><dt>Mouth line</dt><dd>Y {filmCritterRig.anchors.mouthLineY}</dd></div>
          <div><dt>Body center</dt><dd>{filmCritterRig.anchors.bodyCenter.x}, {filmCritterRig.anchors.bodyCenter.y}</dd></div>
          <div><dt>Antenna ball</dt><dd>{filmCritterRig.anchors.antennaBallCenter.x}, {filmCritterRig.anchors.antennaBallCenter.y}</dd></div>
          <div><dt>Face window</dt><dd>{filmCritterRig.faceWindow.width} x {filmCritterRig.faceWindow.height}</dd></div>
        </dl>
        <p className={invalidCount > 0 ? "rig-warning" : "rig-success"}>
          {invalidCount > 0
            ? `${invalidCount} current asset${invalidCount === 1 ? "" : "s"} do not use the canonical 1024x1024 canvas yet. They are marked invalid instead of being compensated for in code.`
            : "All loaded assets use the canonical 1024x1024 canvas."}
        </p>
      </section>

      <section className="settings-panel">
        <div className="settings-panel-heading">
          <h2>Base avatars</h2>
        </div>
        <div className="rig-asset-grid">
          {avatars.map((avatar) => (
            <div className="rig-asset-card" key={avatar.id}>
              <FilmCritterComposite avatar={avatar} />
              <strong>{avatar.name}</strong>
              <AssetBadge check={checks[assetKey("base", avatar.id)]} />
            </div>
          ))}
        </div>
      </section>

      <section className="settings-panel">
        <div className="settings-panel-heading">
          <h2>Skin overlays</h2>
        </div>
        <div className="rig-asset-grid">
          {skins.map((skin) => (
            <div className="rig-asset-card" key={skin.id}>
              <span className="film-critter-composite" aria-label={`${skin.name} skin overlay`} role="img">
                <img className="film-critter-layer film-critter-skin-layer" src={skin.imagePath} alt="" loading="lazy" decoding="async" />
              </span>
              <strong>{skin.name}</strong>
              <AssetBadge check={checks[assetKey("skin", skin.id)]} />
            </div>
          ))}
        </div>
      </section>

      <section className="settings-panel">
        <div className="settings-panel-heading">
          <h2>96 combination grid</h2>
        </div>
        <div className="rig-combination-grid">
          {avatars.flatMap((avatar) =>
            skins.map((skin) => {
              const baseCheck = checks[assetKey("base", avatar.id)];
              const skinCheck = checks[assetKey("skin", skin.id)];
              const invalid = baseCheck?.status === "invalid" || skinCheck?.status === "invalid";
              return (
                <div className={invalid ? "rig-combo-card is-invalid" : "rig-combo-card"} key={`${avatar.id}-${skin.id}`}>
                  <FilmCritterComposite avatar={avatar} skin={skin} />
                  <span>{avatar.name} + {skin.name}</span>
                  {invalid ? <small>Asset canvas invalid</small> : <small>Canonical rig</small>}
                </div>
              );
            })
          )}
        </div>
      </section>
    </section>
  );
}

