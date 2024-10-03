import {
  Algos,
  d,
  HabState,
  messagize,
  Operation,
  randomPasscode,
  ready,
  Siger,
  SignifyClient,
  Tier,
  randomNonce,
  CreateRegistryArgs,
} from "signify-ts";
// } from "signify-ts-old"; // Use signify-ts-old if testing against KERIA 0.1.3
import { sleep } from "./test-utils";

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
  static randomNonce(): string {
    return randomNonce();
  }

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
    await this.wait(inceptOperation);

    const agentResult = await this.client.identifiers().addEndRole(alias, "agent", agentId);
    const agentOperation = await agentResult.op();
    await this.wait(agentOperation);

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
    await this.wait(op2);
  }

  async queryKeyState(prefix: string) {
    const op = await this.client.keyStates().query(prefix);
    await this.wait(op);
  }

  async createGroup(groupAlias: string, args: { smids: string[]; isith: number }) {
    const mhab = this.identifier;
    if (!mhab) {
      throw new Error("No local identifier created");
    }

    const states = await Promise.all(
      args.smids.map(async (member) => {
        const result = await this.client.keyStates().get(member);
        return result[0];
      })
    );

    const res = await this.client.identifiers().create(groupAlias, {
      algo: Algos.group,
      isith: args.isith,
      nsith: args.isith,
      mhab,
      states,
      rstates: states,
    });

    const attachment = d(
      messagize(
        res.serder,
        res.sigs.map((sig: string) => new Siger({ qb64: sig }))
      )
    ).substring(res.serder.size);

    const embeds = {
      icp: [res.serder, attachment],
    };

    await this.client
      .exchanges()
      .send(mhab.name, "multisig", mhab, "/multisig/icp", { smids: args.smids }, embeds, args.smids);

    return await res.op();
  }

  private createSeal(hab: HabState) {
    const habStateEvent = hab.state?.ee as { s: string; d: string };
    const seal = [
      "SealEvent",
      {
        i: hab["prefix"],
        s: habStateEvent["s"],
        d: habStateEvent["d"],
      },
    ];

    return seal;
  }

  async listEndRoles(alias: string, role = "agent") {
    const path = role !== undefined ? `/identifiers/${alias}/endroles/${role}` : `/identifiers/${alias}/endroles`;
    const response: Response = await this.client.fetch(path, "GET", null);
    if (!response.ok) throw new Error(await response.text());
    const result = await response.json();
    return result;
  }

  async configureGroupAgents(groupAlias: string, dt: string): Promise<Operation[]> {
    const members = await this.client.identifiers().members(groupAlias);
    const ops: Operation[] = [];

    for (const { aid, ends } of members.signing) {
      const [agentId] = Object.keys(ends.agent);

      if (typeof agentId !== "string") {
        throw new Error(`No agent id on member ${aid}`);
      }

      const op = await this.addEndRole(groupAlias, dt, agentId);
      ops.push(op);
    }

    return ops;
  }

  async listOtherMembers(group: HabState) {
    const recipients = await this.client
      .identifiers()
      .members(group.name)
      .then((members) =>
        members.signing.map((m: { aid: string }) => m.aid).filter((aid: string) => aid !== group.group?.mhab.prefix)
      );

    return recipients;
  }

  async addEndRole(groupAlias: string, timestamp: string, agentId: string) {
    const hab = await this.client.identifiers().get(groupAlias);
    const result = await this.client.identifiers().addEndRole(hab.name, "agent", agentId, timestamp);
    const operation = await result.op();

    if ("group" in hab && hab.group) {
      const recipients = await this.listOtherMembers(hab);
      const seal = this.createSeal(hab);
      const sigers = result.sigs.map((sig: string) => new Siger({ qb64: sig }));
      const roleims = d(messagize(result.serder, sigers, seal, undefined, undefined, false));
      const atc = roleims.substring(result.serder.size);

      await this.client.exchanges().send(
        hab.group.mhab.name,
        "multisig",
        hab.group.mhab,
        "/multisig/rpy",
        { gid: hab.prefix },
        {
          rpy: [result.serder, atc],
        },
        recipients
      );
    }

    return operation;
  }

  async refreshState(groupAlias: string, anchor?: string) {
    let hab = await this.client.identifiers().get(groupAlias);
    const op = await this.client.keyStates().query(hab.prefix, undefined, anchor);
    return op;
  }

  async createRegistry(args: CreateRegistryArgs) {
    let hab = await this.client.identifiers().get(args.name);

    const result = await this.client.registries().create({
      name: args.name,
      registryName: args.registryName,
      nonce: args.nonce,
    });

    const op = await result.op();

    if ("group" in hab && hab.group) {
      const recipients = await this.listOtherMembers(hab);
      const sigers = result.sigs.map((sig: string) => new Siger({ qb64: sig }));
      const ims = d(messagize(result.serder, sigers));
      const atc = ims.substring(result.serder.size);

      await this.client.exchanges().send(
        hab.group.mhab.name,
        "multisig",
        hab.group.mhab,
        "/multisig/vcp",
        { gid: hab.prefix },
        {
          vcp: [result.regser, ""],
          anc: [result.serder, atc],
        },
        recipients
      );
    }

    return op;
  }

  async wait<T>(
    op: Operation<T>,
    options: {
      signal?: AbortSignal;
      minSleep?: number;
      maxSleep?: number;
      increaseFactor?: number;
      onRetry?: (op: Operation<T>) => void;
    } = {}
  ): Promise<Operation<T>> {
    let operation = op;
    let retryCount = 0;

    while (!operation.done) {
      options.signal?.throwIfAborted();

      operation = await this.client.operations().get(operation.name);

      if (options.onRetry) {
        options.onRetry(operation);
      }

      await sleep(
        Math.min(
          Math.max(options.minSleep ?? 100, (options.increaseFactor ?? 2) ** retryCount),
          options.maxSleep ?? 1000
        )
      );

      retryCount++;
    }
    return operation;
  }
}
