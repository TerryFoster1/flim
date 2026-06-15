import { baseAvatars, avatarSkins } from "./avatarCatalog";

export const filmCritterRig = {
  canvas: {
    width: 1024,
    height: 1024,
  },
  anchors: {
    characterCenterX: 512,
    headCenter: { x: 512, y: 395 },
    faceCenter: { x: 512, y: 410 },
    eyeLineY: 375,
    mouthLineY: 500,
    bodyCenter: { x: 512, y: 700 },
    antennaRoot: { x: 512, y: 245 },
    antennaTip: { x: 512, y: 145 },
    antennaBallCenter: { x: 512, y: 145 },
  },
  bounds: {
    maxCharacter: {
      left: 190,
      right: 834,
      top: 80,
      bottom: 930,
      width: 644,
      height: 850,
    },
    maxSkin: {
      left: 140,
      right: 884,
      top: 60,
      bottom: 940,
    },
  },
  faceWindow: {
    center: { x: 512, y: 395 },
    width: 360,
    height: 360,
  },
} as const;

export const filmCritterRigAssets = {
  baseAvatars,
  skins: avatarSkins,
};
