export type GuideJobStatus =
  'pending' | 'processing' | 'created' | 'uncertain' | 'failed';

export type GuideJobAction =
  | 'claim'
  | 'mark_created'
  | 'mark_uncertain'
  | 'mark_failed'
  | 'resolve_uncertain';

const transitions: Readonly<
  Record<GuideJobStatus, Partial<Record<GuideJobAction, GuideJobStatus>>>
> = {
  pending: { claim: 'processing' },
  processing: {
    mark_created: 'created',
    mark_uncertain: 'uncertain',
    mark_failed: 'failed',
  },
  uncertain: { resolve_uncertain: 'created' },
  created: {},
  failed: {},
};

export function assertGuideJobTransition(
  current: GuideJobStatus,
  action: GuideJobAction,
): GuideJobStatus {
  const next = transitions[current][action];
  if (next === undefined) {
    throw new Error(
      `Action ${action} is not allowed from guide job ${current}`,
    );
  }
  return next;
}
