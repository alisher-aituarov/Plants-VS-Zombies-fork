import {
  ZombieConfig, ZombiePreset, ZombiesStatesPreset, ZombieHeadPreset,
} from '../types';
import zombiePresets from '../data/zombies.json';
import zombieHeadPresets from '../data/zombies_head.json';

import Engine from '../engine';
import Cell from '../game/Cell';
import Plant from './Plant';
import { ISpriteNode } from '../engine/types';
import Vector from '../engine/core/Vector';

require.context('../assets/sprites/zombies', true, /\.(png|jpg)$/);

const X_MAX = -60;
const Y_MIN = -5;
const Y_MAX = -100;
const X_MIN = {
  all: -20,
  dancer: 10,
};

const X_AXIS = 970;
const Y_AXIS = {
  all: 5,
  pole: -5,
};

const SPEED = {
  slow: 0.11,
  normal: 0.19,
  fast: 0.25,
  superFast: 0.47,
};

export default class Zombie {
  private zombiePresets: { [dymanic: string]: ZombiePreset } = zombiePresets;

  private zombieHeadPresets: { [dymanic: string]: ZombieHeadPreset } = zombieHeadPresets;

  private speed: number;

  public health: number;

  public damage: number;

  readonly width: number;

  readonly height: number;

  private image: string;

  public name: string;

  private frames: number;

  private shadow: string;

  private head: string;

  private headWidth: number;

  private headHeight: number;

  private headFrames: number;

  private headSpeed: number;

  private headDh: number;

  public startDelay: number;

  private zombieSpeed: number;

  public position: Vector;

  public row: number;

  private engine: Engine;

  public node: ISpriteNode;

  private spotlight: ISpriteNode;

  private spotlightShade: ISpriteNode;

  public opacity: number;

  private interval: any;

  private isJump: boolean;

  public isEndJump: boolean = false;

  private states: { [dynamic: string]: ZombiesStatesPreset };

  private attackedPlant: Plant;

  private isSlow: boolean;

  private slowTimeout: any;

  public isDestroyedFlag: boolean;

  constructor(config: ZombieConfig, engine: Engine) {
    this.speed = this.zombiePresets[config.type].speed;
    this.health = this.zombiePresets[config.type].health;
    this.damage = this.zombiePresets[config.type].damage;
    this.width = this.zombiePresets[config.type].width;
    this.height = this.zombiePresets[config.type].height;
    this.image = this.zombiePresets[config.type].image;
    this.name = this.zombiePresets[config.type].name;
    this.frames = this.zombiePresets[config.type].frames;
    this.shadow = this.zombiePresets[config.type].shadow;
    this.states = this.zombiePresets[config.type].states;
    this.head = this.zombieHeadPresets[config.type].image;
    this.headWidth = this.zombieHeadPresets[config.type].width;
    this.headHeight = this.zombieHeadPresets[config.type].height;
    this.headFrames = this.zombieHeadPresets[config.type].frames;
    this.headSpeed = this.zombieHeadPresets[config.type].speed;
    this.headDh = this.zombieHeadPresets[config.type].dh;
    this.engine = engine;
  }

  public draw(cell: Cell, occupiedCells: Map<Cell, Plant>) {
    this.zombieSpeed = this.setSpeed();
    const y = this.setY();
    let start = 0;

    const image = this.engine.loader.files[this.image];

    const generateStates = () => {
      const statesArr = Object.entries(this.states).map((state) => {
        const img = this.engine.loader.files[state[1].image];
        const size = new Vector(state[1].width * state[1].frames, state[1].height);
        const {
          frames, speed, dh, repeat,
        } = state[1];
        return [
          state[0],
          {
            img,
            frames,
            speed,
            size,
            dh,
            repeat,
          },
        ];
      });
      return Object.fromEntries(statesArr);
    };

    const update = () => {
      start += this.zombieSpeed;
      this.node.position = this.engine.vector(X_AXIS - start, cell.getBottom() - this.height - y);
      if (this.isJump) this.node.position.x = this.trackPositionAfterJump();

      this.trackPosition();
    };

    const updateSpotlight = () => {
      if (this.spotlight) {
        this.spotlight.position = this.engine.vector(
          X_AXIS - start - 25,
          cell.getBottom() - this.height * 3 - 70,
        );

        this.spotlightShade.position = this.engine.vector(
          X_AXIS - start - 35,
          cell.getBottom() - this.height + 110,
        );
      }
    };

    this.node = this.engine
      .createNode(
        {
          type: 'SpriteNode',
          position: this.engine.vector(X_AXIS, cell.getBottom() - this.height - Y_AXIS.all),
          size: this.engine.vector(this.width * this.frames, this.height),
          layer: `row-${this.row + 1}`,
          img: image,
          frames: this.frames,
          startFrame: 0,
          speed: this.speed,
          dh: this.height,
          states: this.states ? generateStates() : undefined,
          shadow: this.shadow,
        },
        update,
      )
      .addTo('scene') as ISpriteNode;

    if (this.name === 'dancer_2') {
      const timeout = this.engine.timeout(() => {
        timeout.destroy();
        this.addSpotlight(updateSpotlight);
      }, 100);
      this.engine.getTimer('levelTimer').add(timeout);
    }

    this.updateZombieState();
  }

  public attack(occupiedCells: Map<Cell, Plant>) {
    if (this.isDestroyedFlag) return;
    occupiedCells.forEach((plant, cell) => {
      const positionJump = this.poleGuyPositionConditionForJump(plant);
      const positionAttack = this.poleGuyPositionConditionForAttack(plant);

      // Only for pole guy
      if (this.name === 'pole') {
        if (!this.isEndJump && positionJump) {
          this.isEndJump = true;
          this.jump();
        } else if (this.isEndJump && positionAttack) {
          this.node.switchState('attack');
          this.zombieSpeed = 0;
          this.makeDamage(plant);

          if (plant.health <= 0) {
            this.eatThePlant(plant);
            occupiedCells.delete(cell);
            this.node.switchState('walkingSlow');
            this.zombieSpeed = SPEED.normal;
          }
        }
        // For all others
      } else {
        const xMin = this.setX();
        if (
          this.node.position.x - plant.position.x < xMin
          && this.node.position.x - plant.position.x > X_MAX
          && this.node.position.y - plant.position.y < Y_MIN
          && this.node.position.y - plant.position.y > Y_MAX
        ) {
          this.node.switchState('attack');
          this.zombieSpeed = 0;
          this.makeDamage(plant);

          if (plant.health <= 0) {
            this.eatThePlant(plant);
            occupiedCells.delete(cell);
            this.node.switchState('walking');
            this.zombieSpeed = this.setSpeed();
          }
        }
      }
    });

    const isPlantDestroyed = this.attackedPlant && this.attackedPlant.isDestroyedFlag;

    if (isPlantDestroyed && this.node.currentState === 'attack') {
      this.walk();
    }
  }

  public walk() {
    if (this.isDestroyedFlag) return;
    this.node.switchState('walking');
    this.zombieSpeed = this.setSpeed();
  }

  private makeDamage(plant: Plant) {
    plant.reduceHealth(this.damage);
    this.engine.audioPlayer.playSoundRand(['eat1', 'eat2', 'eat3']);
  }

  private eatThePlant(plant: Plant) {
    plant.destroy();
    return this;
  }

  public stop() {
    this.interval?.destroy();
    if (this.isDestroyedFlag) return;
    this.node.switchState('stop');
    this.zombieSpeed = 0;
  }

  public reduceHealth(num: number, plant?: Plant) {
    if (this.health >= 0) {
      this.health -= num;
    }
    if (this.health < 0) this.health = 0;

    if (!(plant && plant.shotType === 'snow')) {
      this.node.filter = 'brightness(1.2)';
      const timeout = this.engine.timeout(() => {
        timeout.destroy();
        this.node.filter = 'brightness(1)';
      }, 180);
      this.engine.getTimer('levelTimer').add(timeout);
    } else if (
      this.name === 'football'
      || this.name === 'dancer'
      || this.name === 'dancer_2'
      || this.name === 'dancer_3'
    ) {
      this.node.filter = 'hue-rotate(190deg) saturate(0.82)';
    } else {
      this.node.filter = 'hue-rotate(145deg) saturate(1.5)';
    }
  }

  private lostHead() {
    this.node.switchState('lost_head');

    if (this.head) {
      const image = this.engine.loader.files[this.head] as HTMLImageElement;

      const head = this.engine
        .createNode({
          type: 'SpriteNode',
          position: this.engine.vector(this.position.x + 60, this.position.y),
          size: this.engine.vector(this.headWidth * this.headFrames, this.headHeight),
          layer: 'top',
          img: image,
          frames: this.headFrames,
          width: this.headWidth,
          height: this.headHeight,
          startFrame: 0,
          speed: this.headSpeed,
          dh: this.headDh,
          repeat: 1,
        })
        .addTo('scene') as ISpriteNode;

      head.then(() => head.destroy());
    }
  }

  public remove() {
    this.interval?.destroy();
    if (this.isDestroyedFlag) return;
    const death = this.engine.timeout(() => {
      this.zombieSpeed = 0;
      this.node.switchState('death');
    }, 200);
    const end = this.engine.timeout(() => {
      this.node.switchState('end');
      this.node.opacity = 0.7;
    }, 600);
    const destroy = this.engine.timeout(() => {
      this.node.destroy();
      if (this.spotlight) {
        this.spotlight.destroy();
        this.spotlightShade.destroy();
      }
    }, 700);

    const timer = this.engine
      .timer([death, end, destroy], true)
      .before(() => {
        this.isDestroyedFlag = true;
        this.lostHead();
      })
      .finally(() => timer.destroy());

    this.engine.getTimer('levelTimer').add(timer);
  }

  public jump() {
    this.zombieSpeed = 0;
    this.node.switchState('jump');
    this.isJump = false;

    this.node.then(() => {
      this.isJump = true;
      this.node.switchState('jumpEnd');
      this.node.then(() => {
        this.node.switchState('walkingSlow');
        this.zombieSpeed = 0.33;
      });
    });

    return this.node.position.x;
  }

  public burn() {
    this.interval?.destroy();
    if (this.isDestroyedFlag) return;
    this.isDestroyedFlag = true;
    this.zombieSpeed = 0;
    this.node.switchState('burn');
    this.node.then(() => {
      this.node.destroy();
      if (this.spotlight) {
        this.spotlight.destroy();
        this.spotlightShade.destroy();
      }
    });
  }

  public slow() {
    if (this.isDestroyedFlag) return;

    if (!this.isSlow) {
      if (this.name === 'newspaper') {
        this.zombieSpeed -= 0;
      } else if (this.name === 'football') {
        if (this.zombieSpeed - 0.34 > 0) {
          this.zombieSpeed -= 0.34;
        }
      } else if (this.zombieSpeed - 0.14 > 0) {
        this.zombieSpeed -= 0.14;
      }
      this.node.speed += 40;

      this.isSlow = true;
    }

    this.slowTimeout?.destroy();

    this.slowTimeout = this.engine.timeout(() => {
      this.slowTimeout.destroy();
      this.zombieSpeed = this.setSpeed();
      this.node.filter = '';
      this.isSlow = false;
      this.speed = this.node.speed;
    }, 5000);

    this.engine.getTimer('levelTimer').add(this.slowTimeout);
  }

  private trackPosition() {
    if (this.node.position) {
      this.position = this.node.position;
    }
    return this.position;
  }

  trackPositionAfterJump() {
    this.node.position.x -= 150;
    return this.node.position.x;
  }

  // Set different speed for zombies
  private setSpeed() {
    if (this.name === 'dancer' || this.name === 'dancer_2' || this.name === 'dancer_3') {
      this.zombieSpeed = SPEED.fast;
    } else if (this.name === 'newspaper') {
      this.zombieSpeed = SPEED.slow;
    } else if (this.name === 'football' || this.name === 'pole') {
      this.zombieSpeed = SPEED.superFast;
    } else {
      this.zombieSpeed = SPEED.normal;
    }
    return this.zombieSpeed;
  }

  // Dance
  private updateZombieState() {
    if (!['dancer', 'dancer_2', 'dancer_3'].includes(this.name)) return;

    const delay = this.name === 'dancer' ? 800 : 1800;

    const danceTimeout = this.engine.timeout(() => this.node.switchState('dance'), 5000);
    const walkingTimeout = this.engine.timeout(() => this.node.switchState('walking'), delay);

    const timer = this.engine.timer([danceTimeout, walkingTimeout], true);
    this.interval = this.engine.interval(() => timer.start(), 10000).before(() => timer.start());
    this.engine.getTimer('levelTimer').add(this.interval);
  }

  // Position conditions for pole guy
  private poleGuyPositionConditionForJump(plant: any) {
    let position: boolean;
    if (
      this.node.position.x - plant.position.x < -80
      && this.node.position.x - plant.position.x > -150
      && this.node.position.y - plant.position.y < -100
      && this.node.position.y - plant.position.y > -130
    ) {
      position = true;
    } else {
      position = false;
    }
    return position;
  }

  private poleGuyPositionConditionForAttack(plant: any) {
    let position: boolean;
    if (
      this.node.position.x - plant.position.x < -140
      && this.node.position.x - plant.position.x > -210
      && this.node.position.y - plant.position.y < -100
      && this.node.position.y - plant.position.y > -130
    ) {
      position = true;
    } else {
      position = false;
    }
    return position;
  }

  // Spotlight for dancing guy
  private addSpotlight(update: () => void) {
    const spotlight = this.engine.loader.files[
      'assets/sprites/zombies/dancer/spotlight.png'
    ] as HTMLImageElement;
    const spotlightShade = this.engine.loader.files[
      'assets/sprites/zombies/dancer/spotlight2.png'
    ] as HTMLImageElement;

    this.spotlight = this.engine
      .createNode(
        {
          type: 'SpriteNode',
          position: this.engine.vector(0, 0),
          size: this.engine.vector(50 * 5, 155),
          layer: 'main',
          img: spotlight,
          frames: 5,
          width: 50,
          height: 155,
          startFrame: 0,
          speed: 480,
          dh: 600,
        },
        update,
      )
      .addTo('scene') as ISpriteNode;

    this.spotlightShade = this.engine
      .createNode(
        {
          type: 'SpriteNode',
          position: this.engine.vector(0, 0),
          size: this.engine.vector(50 * 5, 155),
          layer: 'main',
          img: spotlightShade,
          frames: 5,
          width: 50,
          height: 20,
          startFrame: 0,
          speed: 480,
          dh: 600,
        },
        update,
      )
      .addTo('scene') as ISpriteNode;
  }

  // Set coordinates
  private setX() {
    let x = 0;
    if (this.name === 'dancer' || this.name === 'dancer_2' || this.name === 'dancer_3') {
      x = X_MIN.dancer;
    } else {
      x = X_MIN.all;
    }
    return x;
  }

  private setY() {
    let y = 0;
    if (this.name === 'pole') {
      y = Y_AXIS.pole;
    } else {
      y = Y_AXIS.all;
    }
    return y;
  }
}
