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
}
