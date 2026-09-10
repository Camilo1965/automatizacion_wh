import type { WhatsAppConnection } from '@camila/contracts';

type ConnectionConfiguration = Readonly<{
  phoneNumberId?: string;
  wabaId?: string;
  webhookConfigured: boolean;
  coexistenceEvidence?: Readonly<{ source: string; checkedAt: Date }>;
}>;

export class ConnectionCapabilityService {
  constructor(
    private readonly configuration: ConnectionConfiguration,
    private readonly now: () => Date = () => new Date(),
  ) {}

  getConnection(): WhatsAppConnection {
    const evidence = this.configuration.coexistenceEvidence;
    return {
      mode:
        evidence === undefined ? 'cloud_api_only' : 'business_app_coexistence',
      mobileAppAvailable: evidence !== undefined,
      phoneNumberId: this.configuration.phoneNumberId ?? null,
      wabaId: this.configuration.wabaId ?? null,
      webhookConfigured: this.configuration.webhookConfigured,
      serviceWindowHours: 24,
      evidenceSource: evidence?.source ?? null,
      checkedAt: (evidence?.checkedAt ?? this.now()).toISOString(),
    };
  }
}
