export const NAV_ITEMS = [
  { key: 'dashboard', path: '/dashboard', label: 'Дашборд', title: 'Финансовый дашборд' },
  { key: 'money', path: '/money', label: 'Деньги', title: 'Деньги' },
  { key: 'profit', path: '/profit', label: 'Прибыль', title: 'Прибыль' },
  { key: 'capital', path: '/capital', label: 'Капитал' , title: 'Капитал' }
] as const;

export type PageKey = typeof NAV_ITEMS[number]['key'];

export function getPageTitle(pathname: string) {
  const item = NAV_ITEMS.find((nav) => pathname.startsWith(nav.path));
  return item ? item.title : 'Финансовый дашборд';
}

export function getPageKey(pathname: string): PageKey {
  const item = NAV_ITEMS.find((nav) => pathname.startsWith(nav.path));
  return item ? item.key : 'dashboard';
}
