// Tunables for the whole app. Pure data: safe to import from Node (scanner, plugin) and the browser.

export const config = {
  siteTitle: 'Library',

  room: {
    /** Base length along x (the long window wall). Grows when bookcases need more room. */
    length: 7,
    /** Depth along z (north wall to window wall). */
    depth: 5.5,
    height: 3.2,
    wallThickness: 0.2,
    /** Clear floor kept in front of the windows (no wall bookcases reach into it). */
    windowClearance: 1.6,
    /** Length added each time the room has to grow. */
    growStep: 1.9,
    maxLength: 200,
  },

  bookcase: {
    boardWidth: 1.0,
    depth: 0.35,
    levels: 5,
    lowestBoard: 0.25,
    levelSpacing: 0.45,
    boardThickness: 0.03,
    sidePanel: 0.03,
    /** Gap kept in the corners so wall runs don't overlap. */
    cornerGap: 0.4,
    aisle: 1.4,
    /** Freestanding stacks are at most this many sections long (shorter in a shallow room). */
    stackSections: 3,
    /** Floor kept clear for the reading tables in front of the windows (stacks stop short of it). */
    tableZone: 2.3,
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
    /** Frosted window glass: blur as a mip level of the garden cube map (0 = clear glass, 4+ = milky). */
    glassBlur: 1.3,
    /** Size of each face of the garden cube map seen through the glass. */
    glassResolution: 256,
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
