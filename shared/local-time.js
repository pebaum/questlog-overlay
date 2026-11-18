const weekdays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const two = n => String(n).padStart(2, '0');

export function clockLabel(hour, minute, separator = '.') {
  return `${hour % 12 || 12}${separator}${two(minute)}${hour < 12 ? 'A' : 'P'}`;
}

export function localStamp(date) {
  return `${clockLabel(date.getHours(), date.getMinutes(), ':')} - ${weekdays[date.getDay()]} ${two(date.getMonth() + 1)}.${two(date.getDate())}`;
}
