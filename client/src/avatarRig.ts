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
      faceHoleCenter: { x: 313, y: 209 },
      faceHoleDiameter: 175,
      antennaRoot: { x: 234, y: 88 },
      antennaBallCenter: { x: 234, y: 60 },
      antennaBallDiameter: 10,
    },
    {
      id: "spaceman",
      canvas: { width: 512, height: 512 },
      faceHoleCenter: { x: 256, y: 170 },
      faceHoleDiameter: 151,
      antennaRoot: { x: 302, y: 33 },
      antennaBallCenter: { x: 302, y: 6 },
      antennaBallDiameter: 8,
    },
    {
      id: "gearbox",
      canvas: { width: 512, height: 512 },
      faceHoleCenter: { x: 257, y: 261 },
      faceHoleDiameter: 165,
      antennaRoot: { x: 261, y: 81 },
      antennaBallCenter: { x: 261, y: 54 },
      antennaBallDiameter: 10,
    },
    {
      id: "spook",
      canvas: { width: 512, height: 512 },
      faceHoleCenter: { x: 257, y: 261 },
      faceHoleDiameter: 168,
      antennaRoot: { x: 300, y: 88 },
      antennaBallCenter: { x: 300, y: 61 },
      antennaBallDiameter: 9,
    },
    {
      id: "peg-leg",
      canvas: { width: 512, height: 512 },
      faceHoleCenter: null,
      faceHoleDiameter: null,
      antennaRoot: { x: 259, y: 177 },
      antennaBallCenter: { x: 259, y: 124 },
      antennaBallDiameter: 62,
    },
    {
      id: "hocus",
      canvas: { width: 512, height: 512 },
      faceHoleCenter: { x: 258, y: 280 },
      faceHoleDiameter: 190,
      antennaRoot: { x: 351, y: 94 },
      antennaBallCenter: { x: 351, y: 65 },
      antennaBallDiameter: 12,
    },
    {
      id: "ninjin",
      canvas: { width: 512, height: 512 },
      faceHoleCenter: { x: 257, y: 261 },
      faceHoleDiameter: 178,
      antennaRoot: { x: 319, y: 79 },
      antennaBallCenter: { x: 319, y: 50 },
      antennaBallDiameter: 12,
    },
    {
      id: "magnifico",
      canvas: { width: 512, height: 512 },
      faceHoleCenter: null,
      faceHoleDiameter: null,
      antennaRoot: { x: 303, y: 139 },
      antennaBallCenter: { x: 303, y: 111 },
      antennaBallDiameter: 10,
    },
  ],
} as const;

export const filmCritterRigAssets = {
  baseAvatars,
  skins: avatarSkins,
};
