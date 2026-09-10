import {
  WhatsAppConnectionResponseSchema,
  type WhatsAppConnection,
} from '@camila/contracts';
import { apiRequest } from './client';

export async function getWhatsAppConnection(): Promise<WhatsAppConnection> {
  return (
    await apiRequest('/whatsapp/connection', {
      schema: WhatsAppConnectionResponseSchema,
    })
  ).data;
}
