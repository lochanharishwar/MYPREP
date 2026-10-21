import 'server-only';
export function env(name: string, fallback = '') {
  return process.env[name] || fallback;
}
export function required(name: string) {
  const value = env(name);
  if (!value)
    throw Object.assign(
      new Error(`${name} must be configured before this service can run.`),
      { status: 503 },
    );
  return value;
}
