import { HabState, randomPasscode, ready, SignifyClient, Tier } from "signify-ts";

const KERIA_HOSTNAME = process.env.KERIA_HOSTNAME ?? `localhost`;
const KERIA_AGENT_URL = `http://${KERIA_HOSTNAME}:3901`;
const KERIA_BOOT_URL = `http://${KERIA_HOSTNAME}:3903`;

export interface TestWalletOptions {
  alias: string;
}

function assertDefined<T>(obj: T | null): asserts obj is T {
  if (!obj) {
    throw new Error("Unexpected null value");
  }
}

export class TestWallet {
  private _client: SignifyClient | null = null;
  private _identifier: HabState | null = null;

  constructor(private options: TestWalletOptions) {}

  get identifier(): HabState {
    assertDefined(this._identifier);
    return this._identifier;
  }

  get client(): SignifyClient {
    assertDefined(this._client);
    return this._client;
  }

  private async refreshIdentifier() {
    const result = await this.client.identifiers().get(this.options.alias);
    this._identifier = result;
  }

  async init() {
    await this.boot();
    await this.connect();
    await this.createIdentifier();
  }

  async boot() {
    await ready();
    const passcode = randomPasscode();
    const client = new SignifyClient(KERIA_AGENT_URL, passcode, Tier.low, KERIA_BOOT_URL);
    await client.boot();
    this._client = client;
  }

  async connect() {
    await this.client.connect();
  }

  async listAgents() {
    const path = `/identifiers/${this.options.alias}/endroles/agent`;
    const response: Response = await this.client.fetch(path, "GET", null);
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const result = await response.json();
    return result;
  }

  async createIdentifier() {
    const agentId = this.client.agent?.pre;
    if (!agentId) {
      throw new Error(`No agent id available`);
    }

    const alias = this.options.alias;

    const inceptResult = await this.client.identifiers().create(alias, {
      transferable: true,
    });
    const inceptOperation = await inceptResult.op();
    await this.client.operations().wait(inceptOperation);

    const agentResult = await this.client.identifiers().addEndRole(alias, "agent", agentId);
    const agentOperation = await agentResult.op();
    await this.client.operations().wait(agentOperation);

    await this.refreshIdentifier();
  }

  async generateOobi(): Promise<string> {
    const result = await this.client.oobis().get(this.options.alias, "agent");

    const oobi = result.oobis[0];

    if (!oobi || typeof oobi !== "string") {
      throw new Error("No oobi generated");
    }

    return oobi;
  }

  async resolveOobi(oobi: string, alias?: string) {
    const op2 = await this.client.oobis().resolve(oobi, alias);
    await this.client.operations().wait(op2);
  }

  async queryKeyState(prefix: string) {
    const op = await this.client.keyStates().query(prefix);
    await this.client.operations().wait(op);
  }
}
