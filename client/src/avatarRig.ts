import { baseAvatars, avatarSkins } from "./avatarCatalog";

export const filmCritterRig = {
  canvas: {
    width: 512,
    height: 512,
  },
  anchors: {
    characterCenterX: 256,
    headCenter: { x: 256, y: 226 },
    faceCenter: { x: 256, y: 280 },
    eyeLineY: 280,
    mouthLineY: 333,
    bodyCenter: { x: 256, y: 386 },
    antennaRoot: { x: 256, y: 107 },
    antennaTip: { x: 256, y: 38 },
    antennaBallCenter: { x: 256, y: 57 },
  },
  bounds: {
    maxCharacter: {
      left: 50,
      right: 461,
      top: 38,
      bottom: 473,
      width: 412,
      height: 436,
    },
    maxSkin: {
      left: 41,
      right: 470,
      top: 38,
      bottom: 473,
    },
  },
  faceWindow: {
    center: { x: 256, y: 260 },
    width: 190,
    height: 170,
  },
} as const;

export const measuredFilmCritterRig = {
  canonicalAvatarId: "classic",
  tolerancePx: 2,
  avatar: {
    canvas: { width: 512, height: 512 },
    faceCenter: { x: 256, y: 292 },
    faceDiameter: 192,
    antennaRoot: { x: 336, y: 125 },
    antennaBallCenter: { x: 336, y: 72 },
    antennaBallDiameter: 59,
  },
  skins: [
    {
      id: "rex",
      canvas: { width: 512, height: 512 },
      faceHoleCenter: { x: 256, y: 292 },
      faceHoleDiameter: 192,
      antennaRoot: { x: 336, y: 125 },
      antennaBallCenter: { x: 336, y: 72 },
      antennaBallDiameter: 59,
    },
    {
      id: "spaceman",
      canvas: { width: 512, height: 512 },
      faceHoleCenter: { x: 256, y: 292 },
      faceHoleDiameter: 192,
      antennaRoot: { x: 336, y: 125 },
      antennaBallCenter: { x: 336, y: 72 },
      antennaBallDiameter: 59,
    },
    {
      id: "gearbox",
      canvas: { width: 512, height: 512 },
      faceHoleCenter: { x: 256, y: 292 },
      faceHoleDiameter: 192,
      antennaRoot: { x: 336, y: 125 },
      antennaBallCenter: { x: 336, y: 72 },
      antennaBallDiameter: 59,
    },
    {
      id: "spook",
      canvas: { width: 512, height: 512 },
      faceHoleCenter: { x: 256, y: 292 },
      faceHoleDiameter: 192,
      antennaRoot: { x: 336, y: 125 },
      antennaBallCenter: { x: 336, y: 72 },
      antennaBallDiameter: 59,
    },
    {
      id: "peg-leg",
      canvas: { width: 512, height: 512 },
      faceHoleCenter: { x: 256, y: 292 },
      faceHoleDiameter: 192,
      antennaRoot: { x: 336, y: 125 },
      antennaBallCenter: { x: 336, y: 72 },
      antennaBallDiameter: 59,
    },
    {
      id: "hocus",
      canvas: { width: 512, height: 512 },
      faceHoleCenter: { x: 256, y: 292 },
      faceHoleDiameter: 192,
      antennaRoot: { x: 336, y: 125 },
      antennaBallCenter: { x: 336, y: 72 },
      antennaBallDiameter: 59,
    },
    {
      id: "ninjin",
      canvas: { width: 512, height: 512 },
      faceHoleCenter: { x: 256, y: 292 },
      faceHoleDiameter: 192,
      antennaRoot: { x: 336, y: 125 },
      antennaBallCenter: { x: 336, y: 72 },
      antennaBallDiameter: 59,
    },
    {
      id: "magnifico",
      canvas: { width: 512, height: 512 },
      faceHoleCenter: { x: 256, y: 292 },
      faceHoleDiameter: 192,
      antennaRoot: { x: 336, y: 125 },
      antennaBallCenter: { x: 336, y: 72 },
      antennaBallDiameter: 59,
    },
  ],
} as const;

export const filmCritterRigAssets = {
  baseAvatars,
  skins: avatarSkins,
};
