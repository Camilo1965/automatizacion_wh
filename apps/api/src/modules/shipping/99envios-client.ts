import { z } from 'zod';

const baseUrl = 'https://integration.99envios.app/api/integration/v1';

const loginSchema = z.object({ token: z.string().min(1) }).passthrough();
const preShipmentSchema = z
  .object({
    numeroPreenvio: z.string().min(1),
    valorFlete: z.number().nonnegative(),
  })
  .passthrough();

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
      throw new ShippingUncertainError();
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
