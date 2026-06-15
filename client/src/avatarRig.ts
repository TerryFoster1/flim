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

export const filmCritterRigAssets = {
  baseAvatars,
  skins: avatarSkins,
};
