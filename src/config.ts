// Tunables for the whole app. Pure data: safe to import from Node (scanner, plugin) and the browser.

export const config = {
  siteTitle: 'Library',

  room: {
    /** Minimum length along x (the long window wall). Grows only if the books outgrow the bookcase wall. */
    length: 7,
    /** Depth along z (bookcase wall to window wall). */
    depth: 5.5,
    height: 3.2,
    wallThickness: 0.2,
    /** Length added each time the room has to grow (one bookcase section). */
    growStep: 1,
    maxLength: 40,
  },

  bookcase: {
    boardWidth: 1.0,
    depth: 0.35,
    /** Open boards above the cabinets: books sit between ~1 m and ~2.1 m, easy to look at. */
    levels: 3,
    lowestBoard: 1.0,
    levelSpacing: 0.38,
    boardThickness: 0.03,
    sidePanel: 0.03,
    /** Width reserved for the "+" slot in authoring mode. */
    plusSlotWidth: 0.05,
  },

  book: {
    minThickness: 0.015,
    maxThickness: 0.06,
    /** Bytes at which thickness reaches its maximum (log-scaled in between). */
    bytesForMax: 8_000_000,
    minHeight: 0.2,
    maxHeight: 0.3,
    minDepth: 0.15,
    maxDepth: 0.22,
    websiteThickness: 0.01,
    /** Website books share one pale-blue binding so they read as links at a glance. */
    websiteColor: '#cfe2ee',
    gap: 0.002,
    palette: ['#2f3e5c', '#6e2a35', '#2f4f3a', '#b08a3e', '#3a3d42', '#e6dcc3', '#2c6466', '#a8553a'],
  },

  player: {
    eyeHeight: 1.65,
    radius: 0.3,
    walkSpeed: 1.4,
    runSpeed: 2.4,
    maxPitchDeg: 85,
    reach: 3,
    lookSensitivity: 0.0022,
    touchLookSensitivity: 0.005,
  },

  render: {
    minPixelRatio: 0.6,
    maxPixelRatio: 2,
    targetFrameMs: 1000 / 55,
    labelRadius: 9,
    /** Frosted window glass: size of each face of the garden cube seen through it. Smaller = blurrier (48 milky, 256 nearly clear). */
    glassResolution: 96,
  },

  audio: {
    crossFadeSec: 4,
    duckLevel: 0.4,
    defaultVolume: 0.5,
  },

  upload: {
    maxBytes: 250 * 1024 * 1024,
  },

  website: {
    embedHintDelayMs: 8000,
    maxUrlLength: 2048,
  },
} as const

export type Config = typeof config
