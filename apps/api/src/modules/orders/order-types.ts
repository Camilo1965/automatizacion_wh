import type { OrderStatus } from '@camila/contracts';

export type OrderCustomer = Readonly<{
  name: string | null;
  phone: string | null;
}>;

export type OrderDestination = Readonly<{
  address: string | null;
  localityCarrierCode: string | null;
  localityDepartment: string | null;
  localityName: string | null;
  deliveryNotes: string | null;
}>;

export type OrderRecord = Readonly<{
  id: string;
  orderNumber: number;
  status: OrderStatus;
  referenceId: string;
  referenceCode: string;
  referenceModelName: string;
  referenceColor: string;
  unitPriceCop: number;
  size: string;
  quantity: number;
  customer: OrderCustomer;
  destination: OrderDestination;
  draftVersion: number;
  latestSummaryVersion: number;
  confirmedSummaryVersion: number | null;
  createdAt: Date;
  updatedAt: Date;
}>;

export type CreateOrderInput = Readonly<{
  referenceId: string;
  size: string | number;
  quantity: number;
  customerName?: string | null;
  customerPhone?: string | null;
  address?: string | null;
  localityCarrierCode?: string | null;
  deliveryNotes?: string | null;
  adminUserId?: string;
}>;

export type PatchOrderInput = Readonly<{
  orderId: string;
  customerName?: string | null;
  customerPhone?: string | null;
  address?: string | null;
  localityCarrierCode?: string | null;
  deliveryNotes?: string | null;
  adminUserId?: string;
}>;

export type OrderSummary = Readonly<{
  version: number;
  draftVersion: number;
  snapshot: Record<string, unknown>;
  createdAt: Date;
}>;

export type OrderListInput = Readonly<{
  status?: OrderStatus;
  view?: 'incidents' | 'ready_to_dispatch' | 'awaiting_confirmation';
  limit: number;
  after?: Readonly<{ createdAt: Date; id: string }>;
}>;

export type OrderPage = Readonly<{
  items: readonly OrderRecord[];
  nextCursor: Readonly<{ createdAt: Date; id: string }> | null;
}>;
