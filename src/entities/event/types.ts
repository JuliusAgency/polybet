// One team in a sports "game" event (events.teams jsonb, mirrored from Gamma).
export interface GameTeam {
  name: string | null;
  abbreviation: string | null;
  logo: string | null;
  record: string | null;
  color: string | null;
  // 'home' | 'away' — drives row order on the Games card.
  ordering: string | null;
}

export interface MarketEvent {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  image_url: string | null;
  close_at: string | null;
  status: 'open' | 'closed' | 'resolved' | 'archived';
  volume?: number | null;
  tag_slug: string | null;
  tag_label: string | null;
  tag_slugs: string[] | null;
  // Sports "game" metadata (World Cup Games tab). Null on non-match events.
  // See migration 20260616143809_world_cup_games_metadata.
  game_start_time?: string | null;
  sport?: string | null;
  teams?: GameTeam[] | null;
}
