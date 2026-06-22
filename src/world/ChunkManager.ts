import { GAME_WIDTH, GROUND_Y, WORLD_AHEAD, WORLD_BEHIND } from '../game/constants';
import type { PlatformData, WorldEntity } from '../types/game';
import { DifficultyCurve } from './DifficultyCurve';
import { PlatformGenerator } from './PlatformGenerator';

export class ChunkManager {
  private generator: PlatformGenerator;
  private nextPlatformId = 1;
  private nextEntityId = 1;
  private furthestX = 1160;
  private readonly platformList: PlatformData[] = [];
  private readonly entityList: WorldEntity[] = [];

  constructor(seed: string | number = Date.now()) {
    this.generator = new PlatformGenerator(seed, new DifficultyCurve());
    this.reset(seed);
  }

  get platforms(): PlatformData[] {
    return this.platformList;
  }

  get entities(): WorldEntity[] {
    return this.entityList;
  }

  reset(seed: string | number = Date.now()): void {
    this.generator = new PlatformGenerator(seed, new DifficultyCurve());
    this.nextPlatformId = 1;
    this.nextEntityId = 1;
    this.furthestX = 1160;
    this.platformList.splice(0, this.platformList.length, {
      id: 0,
      x: 0,
      y: GROUND_Y,
      w: 1160,
      h: 70,
      kind: 'start',
    });
    this.entityList.splice(0, this.entityList.length);
    this.ensure(0);
  }

  ensure(cameraX: number, viewportWidth = GAME_WIDTH): void {
    const target = cameraX + viewportWidth + WORLD_AHEAD;

    while (this.furthestX < target) {
      const previous = this.platformList[this.platformList.length - 1];
      const platform = this.generator.nextPlatform(previous, this.nextPlatformId);
      this.nextPlatformId += 1;
      this.platformList.push(platform);
      this.furthestX = platform.x + platform.w;

      for (const draft of this.generator.decorate(platform)) {
        this.entityList.push({
          id: this.nextEntityId,
          hit: false,
          ...draft,
        });
        this.nextEntityId += 1;
      }
    }

    this.prune(cameraX);
  }

  markEntityHit(id: number): void {
    const entity = this.entityList.find((candidate) => candidate.id === id);
    if (entity) {
      entity.hit = true;
    }
  }

  private prune(cameraX: number): void {
    const platformStart = this.platformList.findIndex((platform) => platform.x + platform.w > cameraX - WORLD_BEHIND);
    if (platformStart > 0) {
      this.platformList.splice(0, platformStart);
    }

    for (let i = this.entityList.length - 1; i >= 0; i -= 1) {
      const entity = this.entityList[i];
      if (entity.hit || entity.x < cameraX - WORLD_BEHIND) {
        this.entityList.splice(i, 1);
      }
    }
  }
}
