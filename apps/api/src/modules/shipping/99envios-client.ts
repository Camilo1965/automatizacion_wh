import { z } from 'zod';

import { isCarrierId } from './carrier-catalog.js';

const baseUrl = 'https://integration.99envios.app/api/integration/v1';

const loginSchema = z.object({ token: z.string().min(1) }).passthrough();
const preShipmentSchema = z
  .object({
    numeroPreenvio: z
      .union([z.string().min(1), z.number().int().nonnegative()])
      .transform(String),
    valorFlete: z.number().nonnegative().transform(Math.round),
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
      valor_seguro: z.number().nonnegative().optional(),
      valorSeguro: z.number().nonnegative().optional(),
      valor_seguro99: z.number().nonnegative().optional(),
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
  branchCode?: string;
  pdfType?: 1 | 2;
  originLocalityCode?: string;
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
  insurance?: 'none' | 'standard' | 'plus';
}>;

export type QuoteInput = Readonly<{
  localityCode: string;
  declaredValueCop: number;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  shippingDate: string;
  insurance?: 'none' | 'standard' | 'plus';
}>;

export type CarrierQuote = Readonly<{
  carrier: string;
  freightCop: number;
  cashOnDeliveryCop: number;
  surchargeCop: number;
  serviceId: number;
  estimatedDays: string;
  insuranceMode?: 'none' | 'standard' | 'plus';
  insuranceCop?: number;
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
          seguro99: input.insurance === 'standard',
          seguro99plus: input.insurance === 'plus',
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
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new ShippingUncertainError();
    }
    if (!response.ok) {
      if (response.status >= 500) throw new ShippingUncertainError();
      throw new ShippingRequestError(
        `99envios pre-shipment failed with status ${response.status}`,
      );
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ShippingUncertainError();
    }
    const parsed = preShipmentSchema.safeParse(body);
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
          origen: {
            nombre: null,
            codigo: this.options.originLocalityCode ?? null,
          },
          IdTipoEntrega: 1,
          IdServicio: 1,
          valorDeclarado: input.declaredValueCop,
          peso: input.weightKg,
          largo: input.lengthCm,
          ancho: input.widthCm,
          alto: input.heightCm,
          fecha: input.shippingDate,
          AplicaContrapago: true,
          seguro99: input.insurance === 'standard',
          seguro99plus: input.insurance === 'plus',
        }),
        signal: AbortSignal.timeout(20000),
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
          insuranceMode: input.insurance ?? 'none',
          insuranceCop: Math.round(
            quote.valor_seguro ??
              quote.valorSeguro ??
              quote.valor_seguro99 ??
              0,
          ),
        },
      ];
    });
  }

  async getGuidePdf(
    preShipmentNumber: string,
    carrier: string,
  ): Promise<Uint8Array> {
    if (!/^\d+$/.test(preShipmentNumber)) {
      throw new ShippingRequestError('99envios guide number is invalid');
    }
    const numericGuide = Number(preShipmentNumber);
    if (!Number.isSafeInteger(numericGuide)) {
      throw new ShippingRequestError('99envios guide number is invalid');
    }
    const token = await this.login();
    let response: Response;
    try {
      response = await this.request(
        `${baseUrl}/pdf/${this.options.pdfType ?? 2}`,
        {
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
            guia: numericGuide,
            transportadora: { pais: 'colombia', nombre: carrier },
            AplicaContrapago: true,
          }),
          signal: AbortSignal.timeout(30000),
        },
      );
    } catch {
      throw new ShippingRequestError('99envios PDF download request failed');
    }
    if (!response.ok) {
      const providerError = (await response.text().catch(() => '')).trim();
      const branchCode = this.options.branchCode?.trim();
      if (
        response.status === 401 &&
        /^transportadora no encontrada\.?$/i.test(providerError) &&
        branchCode !== undefined &&
        /^\d{1,12}$/.test(branchCode) &&
        isCarrierId(carrier)
      ) {
        return this.getStoredGuidePdf(branchCode, carrier, preShipmentNumber);
      }
      throw new ShippingRequestError(
        `99envios PDF download failed with status ${response.status}`,
      );
    }
    if (!response.headers.get('content-type')?.startsWith('application/pdf')) {
      const rawUrl = (await response.text()).trim();
      let pdfUrl: URL;
      try {
        pdfUrl = new URL(rawUrl);
      } catch {
        throw new ShippingRequestError(
          '99envios PDF download returned invalid data',
        );
      }
      if (
        pdfUrl.origin !== 'https://api.99envios.app' ||
        !pdfUrl.pathname.startsWith('/storage/')
      ) {
        throw new ShippingRequestError(
          '99envios PDF download returned invalid data',
        );
      }
      try {
        response = await this.request(pdfUrl.href, {
          signal: AbortSignal.timeout(30_000),
          redirect: 'error',
        });
      } catch {
        throw new ShippingRequestError('99envios PDF file request failed');
      }
      if (!response.ok) {
        throw new ShippingRequestError(
          `99envios PDF file failed with status ${response.status}`,
        );
      }
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (
      bytes.byteLength < 5 ||
      new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-'
    ) {
      throw new ShippingRequestError(
        '99envios PDF download returned empty data',
      );
    }
    return bytes;
  }

  private async getStoredGuidePdf(
    branchCode: string,
    carrier: string,
    preShipmentNumber: string,
  ): Promise<Uint8Array> {
    const url = new URL(
      `/storage/adjuntos/adjuntos/pdfs/${branchCode}/${carrier}/${branchCode}_${carrier}_${preShipmentNumber}.pdf`,
      'https://api.99envios.app',
    );
    let response: Response;
    try {
      response = await this.request(url.href, {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new ShippingRequestError('99envios portal PDF download failed');
    }
    if (!response.ok) {
      throw new ShippingRequestError(
        `99envios portal PDF download failed with status ${response.status}`,
      );
    }
    if (!response.headers.get('content-type')?.startsWith('application/pdf')) {
      throw new ShippingRequestError(
        '99envios portal PDF download returned invalid data',
      );
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (
      bytes.byteLength < 5 ||
      new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-'
    ) {
      throw new ShippingRequestError(
        '99envios portal PDF download returned invalid data',
      );
    }
    return bytes;
  }

  async getIncidents(branchCode: string) {
    if (!/^\d+$/.test(branchCode))
      throw new ShippingRequestError('Invalid branch code');
    const token = await this.login();
    const response = await this.request(
      `https://integration.99envios.app/api/integration/sucursal/novedades/${encodeURIComponent(branchCode)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!response.ok)
      throw new ShippingRequestError(
        `99envios incidents failed with status ${response.status}`,
      );
    return z
      .object({
        novedades: z.array(
          z
            .object({
              id: z.number().int().positive(),
              numero_preenvio: z
                .union([z.number().int(), z.string().regex(/^\d+$/)])
                .transform(String),
              novedad: z.string(),
              observaciones: z.string().nullable().optional(),
            })
            .passthrough(),
        ),
      })
      .passthrough()
      .parse(await response.json()).novedades;
  }
  async respondIncident(
    id: number,
    guideNumber: string,
    description: string,
    observations: string,
  ) {
    const numeroGuia = Number(guideNumber);
    if (
      !Number.isSafeInteger(numeroGuia) ||
      numeroGuia < 1 ||
      !Number.isSafeInteger(id) ||
      id < 1
    )
      throw new ShippingRequestError('Invalid incident');
    const token = await this.login();
    let response: Response;
    try {
      response = await this.request(
        `https://integration.99envios.app/api/integration/sucursal/novedades/${id}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            numero_guia: numeroGuia,
            novedad_sucursal: description,
            observaciones: observations,
          }),
          signal: AbortSignal.timeout(20000),
        },
      );
    } catch {
      throw new ShippingUncertainError();
    }
    if (response.status >= 500) throw new ShippingUncertainError();
    if (!response.ok)
      throw new ShippingRequestError(
        `99envios incident response failed with status ${response.status}`,
      );
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
        signal: AbortSignal.timeout(20000),
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
