import { evaluateServiceWindow } from './service-window.js';

export class ManualMessageError extends Error {
  constructor(
    readonly code:
      | 'conversation_not_found'
      | 'human_control_required'
      | 'template_required'
      | 'invalid_message',
    message: string,
  ) {
    super(message);
  }
}

export type ManualConversationContext = Readonly<{
  customerPhone: string;
  controlMode: 'bot' | 'human';
  lastInboundMessageAt: Date;
}>;

export interface ManualConversationRepository {
  getManualContext(
    conversationId: string,
  ): Promise<ManualConversationContext | null>;
}

export interface ManualOutboundRepository {
  enqueueText(input: {
    conversationId: string;
    customerPhone: string;
    body: string;
    idempotencyKey: string;
    source: 'owner_panel';
  }): Promise<Readonly<{ id: string }>>;
}

export type SendManualMessageInput = Readonly<{
  conversationId: string;
  actorUserId: string;
  clientRequestId: string;
  text: string;
}>;

export class ManualMessageService {
  constructor(
    private readonly conversations: ManualConversationRepository,
    private readonly outbound: ManualOutboundRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async send(
    input: SendManualMessageInput,
  ): Promise<Readonly<{ id: string; status: 'queued' }>> {
    const text = input.text.trim();
    if (text.length < 1 || text.length > 4096) {
      throw new ManualMessageError(
        'invalid_message',
        'Message must contain between 1 and 4096 characters',
      );
    }
    const context = await this.conversations.getManualContext(
      input.conversationId,
    );
    if (context === null) {
      throw new ManualMessageError(
        'conversation_not_found',
        'Conversation was not found',
      );
    }
    if (context.controlMode !== 'human') {
      throw new ManualMessageError(
        'human_control_required',
        'Take control of the conversation before replying',
      );
    }
    if (!evaluateServiceWindow(context.lastInboundMessageAt, this.now()).open) {
      throw new ManualMessageError(
        'template_required',
        'An approved WhatsApp template is required outside the service window',
      );
    }
    const queued = await this.outbound.enqueueText({
      conversationId: input.conversationId,
      customerPhone: context.customerPhone,
      body: text,
      idempotencyKey: `owner:${input.clientRequestId}`,
      source: 'owner_panel',
    });
    return { id: queued.id, status: 'queued' };
  }
}
