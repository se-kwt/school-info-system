const PHONE_PATTERN = /^\+?[1-9]\d{7,14}$/;

export function isValidPhone(phone: string): boolean {
  return PHONE_PATTERN.test(phone.trim());
}

export function normalizePhone(phone: string): string {
  return phone.trim();
}
