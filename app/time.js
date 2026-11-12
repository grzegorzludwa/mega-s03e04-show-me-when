// R5: an incident time in the viewer's local zone. Date order comes from the locale (dd/mm in EU
// locales, mm/dd in en-US), always joined with "/". The full UTC value stays in <time datetime>.
export function formatLocal(iso, locale = undefined, timeZone = undefined) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dateParts = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', timeZone })
    .formatToParts(d)
    .filter((p) => p.type === 'day' || p.type === 'month')
    .map((p) => p.value);
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone }).format(d);
  const zone = new Intl.DateTimeFormat(locale, { timeZoneName: 'short', timeZone })
    .formatToParts(d)
    .find((p) => p.type === 'timeZoneName')?.value;
  return `${dateParts.join('/')} ${time}${zone ? ` ${zone}` : ''}`;
}
