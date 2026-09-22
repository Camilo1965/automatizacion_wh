export const RELEASE_STEPS = Object.freeze([
  { name: 'install', command: 'pnpm', args: ['install', '--frozen-lockfile'] },
  { name: 'functional', command: 'pnpm', args: ['verify:local'] },
  { name: 'coverage', command: 'pnpm', args: ['test:coverage'] },
  { name: 'dependency-audit', command: 'pnpm', args: ['audit', '--prod'] },
  {
    name: 'production-config',
    command: 'pnpm',
    args: ['check:production-config'],
  },
  { name: 'secrets', command: 'pnpm', args: ['security:secrets'] },
  { name: 'filesystem', command: 'pnpm', args: ['security:filesystem'] },
  { name: 'production-smoke', command: 'pnpm', args: ['production:smoke'] },
  { name: 'images', command: 'pnpm', args: ['security:images'] },
]);

export function runReleaseSteps(steps, run) {
  for (const step of steps) {
    const code = run(step);
    if (code !== 0) return code;
  }
  return 0;
}
