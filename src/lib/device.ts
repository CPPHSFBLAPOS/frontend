// The device name rides along on every request as the x-fbla-device header.
// Header values must be Latin-1, so a name typed on an iPad ("Advisor’s
// iPad", with a curly apostrophe) or with an em dash or emoji would make
// new Headers() throw and blank the whole app. Keep it to plain printable
// ASCII.

export const DEVICE_NAME_MAX = 60;

export function cleanDeviceName(name: string): string {
  return name
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
    .slice(0, DEVICE_NAME_MAX)
    .trim();
}

export function defaultDeviceName(userAgent: string): string {
  if (/CrOS/.test(userAgent)) return 'Chromebook';
  if (/iPhone|Android/.test(userAgent)) return 'Phone';
  if (/iPad|Tablet/.test(userAgent)) return 'Tablet';
  return 'Browser';
}
