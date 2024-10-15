import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { TestWallet, vLEICredential } from "../test-wallet.ts";
import { createTimestamp, formatMemberVariables, sleep } from "../test-utils.ts";

const wallets = Array.from({ length: 3 }).map(
  (_, idx) => new TestWallet({ alias: `member${(idx + 1).toString().padStart(2, "0")}` })
);

const [wallet1, wallet2, wallet3] = wallets;
const isith = wallets.length - 1;

const groupAlias = "group";
const registryName = "reg";
let registryNonce: string;
let regk: string;
let wits: string[];
let toad: number;

beforeAll(async () => {
  await Promise.all(wallets.map((w) => w.init()));
  registryNonce = TestWallet.randomNonce();
  wits = process.env.WITNESS_IDS?.split(";") ?? [];
  toad = Math.min(wits.length, Math.max(wits.length - 1, 0));
});

afterAll(async () => {
  formatMemberVariables(wallets);
});

test("Resolve OOBIs", async () => {
  for (const wallet of [wallet1, wallet2]) {
    for (const other of wallets) {
      if (other.identifier.prefix !== wallet.identifier.prefix) {
        await wallet.resolveOobi(await other.generateOobi(), other.identifier.name);
      }
    }

    expect(await wallet.client.contacts().list()).toHaveLength(2);
  }
});

test("Last member resolve oobi", async () => {
  for (const other of wallets) {
    if (other.identifier.prefix !== wallet3.identifier.prefix) {
      await wallet3.resolveOobi(await other.generateOobi(), other.identifier.name);
    }
  }

  expect(await wallet3.client.contacts().list()).toHaveLength(2);
});

test("All members create multisig group", async () => {
  const smids = wallets.map((w) => w.identifier.prefix);

  await Promise.all(
    wallets.map(async (wallet) => {
      const op = await wallet.createGroup(groupAlias, { smids, isith, wits, toad });
      await wallet.wait(op);
    })
  );
});

test("All members create registry", async () => {
  await Promise.all(
    wallets.map(async (wallet) => {
      const op = await wallet.createRegistry({ name: groupAlias, registryName, nonce: registryNonce });
      await wallet.wait(op);
    })
  );

  const [registry] = await wallet1.client.registries().list(groupAlias);
  expect(registry).toHaveProperty("regk");
});

describe("Credential issuance", async () => {
  const LEI = "OO123123123123123123";

  test.concurrent("Member 1 creates the credential", async () => {
    const group = await wallet1.client.identifiers().get(groupAlias);
    const registry = await wallet1.getRegistry({ owner: groupAlias, name: registryName });

    const op = await wallet1.createCredential(
      groupAlias,
      vLEICredential.qvi({
        holder: wallet1.identifier.prefix,
        issuer: group.prefix,
        LEI,
        registry: registry.regk,
        timestamp: createTimestamp(),
      })
    );

    await wallet1.wait(op, { signal: AbortSignal.timeout(20000) });
  });

  test.concurrent("Member 2 creates the credential - by misunderstanding", async () => {
    // Member 2 accidentally creates the credential on their own, perhaps a misunderstanding
    const group = await wallet2.client.identifiers().get(groupAlias);
    const registry = await wallet2.getRegistry({ owner: groupAlias, name: registryName });

    const op = await wallet2.createCredential(
      groupAlias,
      vLEICredential.qvi({
        holder: wallet1.identifier.prefix,
        issuer: group.prefix,
        LEI,
        registry: registry.regk,
        timestamp: createTimestamp(),
      })
    );

    await wallet2.wait(op, { signal: AbortSignal.timeout(20000) });
  });

  test.concurrent("Member 3 joins credential issuance event", async () => {
    const note = await wallet3.waitNotification("/multisig/iss", AbortSignal.timeout(10000));
    const exn = await wallet3.client.exchanges().get(note.a.d);
    const op = await wallet3.join(groupAlias, exn);

    await wallet3.wait(op, { signal: AbortSignal.timeout(20000) });
  });
});
