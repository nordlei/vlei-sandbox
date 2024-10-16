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
  for (const wallet of wallets) {
    for (const other of wallets) {
      if (other.identifier.prefix !== wallet.identifier.prefix) {
        await wallet.resolveOobi(await other.generateOobi(), other.identifier.name);
      }
    }

    expect(await wallet.client.contacts().list()).toHaveLength(2);
  }
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

  test("Member 1 and 2 creates the credential", async () => {
    const dt = createTimestamp();
    await Promise.all(
      [wallet1, wallet2].map(async (wallet) => {
        const group = await wallet.client.identifiers().get(groupAlias);
        const registry = await wallet.getRegistry({ owner: groupAlias, name: registryName });

        const op = await wallet.createCredential(
          groupAlias,
          vLEICredential.qvi({
            holder: wallet1.identifier.prefix,
            issuer: group.prefix,
            LEI,
            registry: registry.regk,
            timestamp: dt,
          })
        );

        await wallet.wait(op, { signal: AbortSignal.timeout(20000) });
      })
    );
  });

  test("Member 3 has been on holiday and needs to catch up", async () => {
    await sleep(1000);
    const note = await wallet3.waitNotification("/multisig/iss", AbortSignal.timeout(10000));
    const exn = await wallet3.client.exchanges().get(note.a.d);
    const op = await wallet3.join(groupAlias, exn);

    await wallet3.wait(op, { signal: AbortSignal.timeout(20000) });
  });
});
