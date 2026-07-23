export type GameLifecycleEventType = "launch" | "pause" | "resume" | "game_over";

export interface GameLifecycleEvent {
  gameId: string;
  type: GameLifecycleEventType;
  playTimeMs?: number;
  clientEventId?: string;
}

export interface GameScoreEvent {
  gameId: string;
  score: number;
  playTimeMs?: number;
  clientEventId?: string;
}

export interface GameAchievementEvent {
  gameId: string;
  achievementEvent: string;
  clientEventId?: string;
}

export interface GameSaveProvider<TSave = unknown> {
  save(gameId: string, data: TSave): Promise<void>;
  restore(gameId: string): Promise<TSave | null>;
}

export interface GameStatisticsProvider {
  recordLifecycle(event: GameLifecycleEvent): Promise<void>;
  recordScore(event: GameScoreEvent): Promise<void>;
  recordAchievement(event: GameAchievementEvent): Promise<void>;
}

export interface GameLaunchProvider {
  launch(route: string): void;
}

export interface BacklotGamePlatform<TSave = unknown> {
  launchProvider: GameLaunchProvider;
  saveProvider: GameSaveProvider<TSave>;
  statisticsProvider: GameStatisticsProvider;
}
