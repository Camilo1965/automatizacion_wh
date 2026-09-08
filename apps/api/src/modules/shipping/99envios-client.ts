import { z } from 'zod';

const baseUrl = 'https://integration.99envios.app/api/integration/v1';

const loginSchema = z.object({ token: z.string().min(1) }).passthrough();
const preShipmentSchema = z
  .object({
    numeroPreenvio: z.string().min(1),
    valorFlete: z.number().nonnegative(),
  })
  .passthrough();
const quoteResponseSchema = z.record(
  z.string(),
  z
    .object({
      exito: z.boolean(),
      valor: z.number().nonnegative().optional(),
      valor_contrapago: z.number().nonnegative().optional(),
      sobreflete: z.number().nonnegative().optional(),
      IdServicio: z.number().int().positive().optional(),
      dias: z.union([z.string(), z.number()]).optional(),
    })
    .passthrough(),
);

export class ShippingUncertainError extends Error {
  constructor() {
    super('Shipping creation outcome is uncertain');
    this.name = 'ShippingUncertainError';
  }
}

export class ShippingRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShippingRequestError';
  }
}

export type NinetyNineEnviosClientOptions = Readonly<{
  email: string;
  password: string;
  integrationToken?: string;
  integrationId?: string;
  fetch?: typeof globalThis.fetch;
}>;

export type CreatePreShipmentInput = Readonly<{
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  contents: string;
  declaredValueCop: number;
  recipient: Readonly<{
    firstName: string;
    firstSurname: string;
    phone: string;
    address: string;
    localityCode: string;
  }>;
  carrier: string;
  notes: string | null;
}>;

export type QuoteInput = Readonly<{
  localityCode: string;
  declaredValueCop: number;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  shippingDate: string;
}>;

export type CarrierQuote = Readonly<{
  carrier: string;
  freightCop: number;
  cashOnDeliveryCop: number;
  surchargeCop: number;
  serviceId: number;
  estimatedDays: string;
}>;

export class NinetyNineEnviosClient {
  private readonly request: typeof globalThis.fetch;

  constructor(private readonly options: NinetyNineEnviosClientOptions) {
    this.request = options.fetch ?? globalThis.fetch;
  }

  async createPreShipment(
    input: CreatePreShipmentInput,
  ): Promise<Readonly<{ preShipmentNumber: string; freightCop: number }>> {
    const token = await this.login();
    let response: Response;
    try {
      response = await this.request(`${baseUrl}/preenvio`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(this.options.integrationToken === undefined
            ? {}
            : { 'X-Integration-Token': this.options.integrationToken }),
          ...(this.options.integrationId === undefined
            ? {}
            : { 'X-Integration-Id': this.options.integrationId }),
        },
        body: JSON.stringify({
          IdTipoEntrega: 1,
          IdServicio: 1,
          AplicaContrapago: true,
          peso: input.weightKg,
          largo: input.lengthCm,
          ancho: input.widthCm,
          alto: input.heightCm,
          diceContener: input.contents,
          valorDeclarado: input.declaredValueCop,
          seguro99: false,
          seguro99plus: false,
          Destinatario: {
            tipoDocumento: 'CC',
            numeroDocumento: null,
            nombre: input.recipient.firstName,
            primerApellido: input.recipient.firstSurname,
            segundoApellido: null,
            telefono: input.recipient.phone
              .replace(/\D/g, '')
              .replace(/^57/, ''),
            direccion: input.recipient.address,
            idLocalidad: input.recipient.localityCode,
            correo: null,
          },
          Observaciones: input.notes,
          transportadora: { pais: 'colombia', nombre: input.carrier },
          origenCreacion: 1,
        }),
      });
    } catch {
      throw new ShippingUncertainError();
    }
    if (!response.ok) {
      throw new ShippingRequestError(
        `99envios pre-shipment failed with status ${response.status}`,
      );
    }
    const parsed = preShipmentSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new ShippingUncertainError();
    }
    return {
      preShipmentNumber: parsed.data.numeroPreenvio,
      freightCop: parsed.data.valorFlete,
    };
  }

  async quote(input: QuoteInput): Promise<readonly CarrierQuote[]> {
    const token = await this.login();
    let response: Response;
    try {
      response = await this.request(`${baseUrl}/cotizar`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          destino: { nombre: null, codigo: input.localityCode },
          origen: { nombre: null, codigo: null },
          IdTipoEntrega: 1,
          IdServicio: 1,
          valorDeclarado: input.declaredValueCop,
          peso: input.weightKg,
          largo: input.lengthCm,
          ancho: input.widthCm,
          alto: input.heightCm,
          fecha: input.shippingDate,
          AplicaContrapago: true,
          seguro99: false,
          seguro99plus: false,
        }),
      });
    } catch {
      throw new ShippingRequestError('99envios quote request failed');
    }
    if (!response.ok) {
      throw new ShippingRequestError(
        `99envios quote failed with status ${response.status}`,
      );
    }
    const parsed = quoteResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new ShippingRequestError('99envios quote returned invalid data');
    }
    return Object.entries(parsed.data).flatMap(([carrier, quote]) => {
      if (
        !quote.exito ||
        quote.valor === undefined ||
        quote.valor_contrapago === undefined ||
        quote.IdServicio === undefined
      ) {
        return [];
      }
      return [
        {
          carrier,
          freightCop: quote.valor,
          cashOnDeliveryCop: quote.valor_contrapago,
          surchargeCop: quote.sobreflete ?? 0,
          serviceId: quote.IdServicio,
          estimatedDays: String(quote.dias ?? ''),
        },
      ];
    });
  }

  async getGuidePdf(
    preShipmentNumber: string,
    carrier: string,
  ): Promise<Uint8Array> {
    const token = await this.login();
    let response: Response;
    try {
      response = await this.request(`${baseUrl}/pdf/2`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(this.options.integrationToken === undefined
            ? {}
            : { 'X-Integration-Token': this.options.integrationToken }),
          ...(this.options.integrationId === undefined
            ? {}
            : { 'X-Integration-Id': this.options.integrationId }),
        },
        body: JSON.stringify({
          guia: preShipmentNumber,
          transportadora: { pais: 'colombia', nombre: carrier },
          AplicaContrapago: true,
        }),
      });
    } catch {
      throw new ShippingRequestError('99envios PDF download request failed');
    }
    if (!response.ok) {
      throw new ShippingRequestError(
        `99envios PDF download failed with status ${response.status}`,
      );
    }
    if (!response.headers.get('content-type')?.startsWith('application/pdf')) {
      throw new ShippingRequestError(
        '99envios PDF download returned invalid data',
      );
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0) {
      throw new ShippingRequestError(
        '99envios PDF download returned empty data',
      );
    }
    return bytes;
  }

  private async login(): Promise<string> {
    let response: Response;
    try {
      response = await this.request(`${baseUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: this.options.email,
          password: this.options.password,
        }),
      });
    } catch {
      throw new ShippingRequestError(
        '99envios login could not reach the provider',
      );
    }
    if (!response.ok) {
      throw new ShippingRequestError(
        `99envios login failed with status ${response.status}`,
      );
    }
    const parsed = loginSchema.safeParse(await response.json());
    if (!parsed.success)
      throw new ShippingRequestError('99envios login returned invalid data');
    return parsed.data.token;
  }
}
