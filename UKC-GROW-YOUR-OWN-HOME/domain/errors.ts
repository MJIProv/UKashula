/**
 * Business rule violation. Carries a stable code so the UI can translate it
 * into the grower's language (R18: notice in the grower's language).
 */
export class BusinessError extends Error {
  readonly code: string;
  readonly data: Readonly<Record<string, unknown>>;

  constructor(code: string, data: Record<string, unknown> = {}) {
    super(code);
    this.name = 'BusinessError';
    this.code = code;
    this.data = Object.freeze({ ...data });
  }
}

export function check<T>(
  value: T | null | undefined,
  code: string,
  data: Record<string, unknown> = {},
): T {
  if (value === null || value === undefined || value === '') {
    throw new BusinessError(code, data);
  }
  return value;
}
