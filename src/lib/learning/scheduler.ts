import { createEmptyCard, fsrs, generatorParameters, type Card } from 'ts-fsrs';
import type { LearningItem, LearningSnapshot, ReviewEvent } from './model';

export const schedulerParameters = generatorParameters({ request_retention: 0.9, enable_fuzz: false });
const scheduler = fsrs(schedulerParameters);

export function scheduleItem(itemId: string, events: ReviewEvent[], now: Date): Card {
  return scheduleHistory(events.filter((event) => event.itemId === itemId), now);
}

function scheduleHistory(events: ReviewEvent[], now: Date): Card {
  const history = events.filter((event) => !event.undone)
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  let card = createEmptyCard(history.length ? new Date(history[0].at) : now);
  for (const event of history) card = scheduler.next(card, new Date(event.at), event.rating).card;
  return card;
}

export function localDay(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function dueQueue(snapshot: LearningSnapshot, now: Date): LearningItem[] {
  const today = localDay(now, snapshot.settings.timeZone);
  const firstReviews = new Map<string, string>();
  const histories = new Map<string, ReviewEvent[]>();
  for (const event of snapshot.reviews.filter((event) => !event.undone)) {
    const previous = firstReviews.get(event.itemId);
    if (!previous || event.at < previous) firstReviews.set(event.itemId, event.at);
    const history = histories.get(event.itemId) ?? [];
    history.push(event);
    histories.set(event.itemId, history);
  }
  const learnedToday = [...firstReviews.values()]
    .filter((at) => localDay(new Date(at), snapshot.settings.timeZone) === today).length;
  const items = snapshot.items.filter((item) => !snapshot.settings.level || item.level === snapshot.settings.level);
  const scheduled = items.map((item) => ({ item, card: scheduleHistory(histories.get(item.id) ?? [], now) }));
  const due = scheduled.filter(({ item, card }) => firstReviews.has(item.id) && card.due <= now)
    .sort((a, b) => a.card.due.getTime() - b.card.due.getTime() || a.item.id.localeCompare(b.item.id));
  const fresh = scheduled.filter(({ item }) => !firstReviews.has(item.id))
    .slice(0, Math.max(0, snapshot.settings.newPerDay - learnedToday));
  return [...due, ...fresh].map(({ item }) => item);
}

export function ratingPreviews(itemId: string, events: ReviewEvent[], now: Date) {
  return scheduler.repeat(scheduleItem(itemId, events, now), now);
}

export function recordReview(snapshot: LearningSnapshot, event: ReviewEvent) {
  if (snapshot.reviews.some((existing) => existing.id === event.id)) return snapshot;
  if (!snapshot.items.some((item) => item.id === event.itemId)) throw new Error('找不到要複習的卡片。');
  const last = snapshot.reviews.filter((existing) => existing.itemId === event.itemId && !existing.undone)
    .sort((a, b) => b.at.localeCompare(a.at))[0];
  if (last && event.at <= last.at) throw new Error('裝置時間早於上一筆複習，請校正時間後重試。');
  return { ...snapshot, reviews: [...snapshot.reviews, event] };
}
