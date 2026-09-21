// Mock Phaser for Node.js testing environment
// Phaser requires a browser environment, so we mock the parts used by entities

vi.mock('phaser', () => {
  const mockColor = {
    HexStringToColor: (hex: string) => ({ color: 0x4CAF50, r: 76, g: 175, b: 80 }),
  };

  const mockScene = {
    add: {
      rectangle: () => ({
        setStrokeStyle: vi.fn(),
        setDepth: vi.fn(),
        setVisible: vi.fn(),
        setFillStyle: vi.fn(),
        setPosition: vi.fn(),
        setScale: vi.fn(),
        setOrigin: vi.fn(),
        setInteractive: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
        setSize: vi.fn(),
        getPosition: vi.fn(() => ({ x: 0, y: 0 })),
      }),
      circle: () => ({
        setStrokeStyle: vi.fn(),
        setDepth: vi.fn(),
        setVisible: vi.fn(),
        setPosition: vi.fn(),
        setScale: vi.fn(),
        destroy: vi.fn(),
      }),
      text: () => ({
        setOrigin: vi.fn(),
        setDepth: vi.fn(),
        setText: vi.fn(),
        destroy: vi.fn(),
      }),
      container: () => ({
        setDepth: vi.fn(),
        add: vi.fn(),
        setVisible: vi.fn(),
        destroy: vi.fn(),
      }),
      graphics: () => ({
        fillStyle: vi.fn(),
        fillRect: vi.fn(),
        fillCircle: vi.fn(),
        generateTexture: vi.fn(),
        clear: vi.fn(),
        destroy: vi.fn(),
      }),
    },
    tweens: {
      add: vi.fn(),
    },
    cameras: {
      main: {
        width: 1024,
        height: 768,
        setBackgroundColor: vi.fn(),
      },
    },
    input: {
      on: vi.fn(),
    },
    make: {
      graphics: () => ({
        fillStyle: vi.fn(),
        fillRect: vi.fn(),
        fillCircle: vi.fn(),
        generateTexture: vi.fn(),
        clear: vi.fn(),
        destroy: vi.fn(),
      }),
    },
    load: {
      on: vi.fn(),
    },
    scene: {
      start: vi.fn(),
    },
  };

  return {
    default: {
      AUTO: 0,
      Scale: {
        FIT: 0,
        CENTER_BOTH: 0,
      },
      Display: {
        Color: mockColor,
      },
      Game: vi.fn(),
      Scene: class MockScene {
        constructor(public config: any) {}
        add = mockScene.add;
        tweens = mockScene.tweens;
        cameras = mockScene.cameras;
        input = mockScene.input;
        make = mockScene.make;
        load = mockScene.load;
        scene = mockScene.scene;
      },
    },
    __esModule: true,
  };
});

import { vi } from 'vitest';
