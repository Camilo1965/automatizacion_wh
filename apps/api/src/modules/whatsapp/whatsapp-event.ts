export type InboundWhatsAppMessage = Readonly<{
  whatsappMessageId: string;
  businessPhoneNumberId: string;
  customerPhone: string;
  messageType: string;
  textBody: string | null;
  receivedAt: Date;
  payload: unknown;
}>;

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

export function extractInboundWhatsAppMessages(
  payload: unknown,
):
  | Readonly<{ ok: true; messages: readonly InboundWhatsAppMessage[] }>
  | Readonly<{ ok: false }> {
  if (!isRecord(payload) || payload.object !== 'whatsapp_business_account') {
    return { ok: false };
  }
  const entries = payload.entry;
  if (!Array.isArray(entries)) return { ok: false };

  const messages: InboundWhatsAppMessage[] = [];
  for (const entry of entries) {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) return { ok: false };
    for (const change of entry.changes) {
      if (!isRecord(change) || !isRecord(change.value)) return { ok: false };
      const value = change.value;
      if (value.messages === undefined) continue;
      if (!Array.isArray(value.messages) || !isRecord(value.metadata))
        return { ok: false };
      const businessPhoneNumberId = readString(value.metadata.phone_number_id);
      if (businessPhoneNumberId === undefined) return { ok: false };
      for (const message of value.messages) {
        if (!isRecord(message)) return { ok: false };
        const whatsappMessageId = readString(message.id);
        const from = readString(message.from);
        const messageType = readString(message.type);
        const timestamp = readString(message.timestamp);
        const seconds =
          timestamp === undefined ? Number.NaN : Number(timestamp);
        if (
          whatsappMessageId === undefined ||
          from === undefined ||
          messageType === undefined ||
          !/^\d{7,19}$/.test(from) ||
          !Number.isSafeInteger(seconds) ||
          seconds < 0
        )
          return { ok: false };
        const text = isRecord(message.text)
          ? (readString(message.text.body) ?? null)
          : null;
        messages.push({
          whatsappMessageId,
          businessPhoneNumberId,
          customerPhone: `+${from}`,
          messageType,
          textBody: text,
          receivedAt: new Date(seconds * 1000),
          payload: value,
        });
      }
    }
  }
  return { ok: true, messages };
}
