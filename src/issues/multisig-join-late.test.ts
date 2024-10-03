import { beforeAll, expect, test } from "vitest";
import { TestWallet } from "../test-wallet.ts";

const wallets = Array.from({ length: 3 }).map(
  (_, idx) => new TestWallet({ alias: `alias${idx.toString().padStart(2, "0")}` })
);

const [wallet1, wallet2, wallet3] = wallets;
const isith = wallets.length - 1;

const groupAlias = "group";
const registryName = "reg";
let registryNonce: string;
let regk: string;

beforeAll(async () => {
  await Promise.all(wallets.map((w) => w.init()));
  registryNonce = TestWallet.randomNonce();
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

test("First two members create multisig group", async () => {
  const smids = wallets.map((w) => w.identifier.prefix);

  await Promise.all(
    [wallet1, wallet2].map(async (wallet) => {
      const op = await wallet.createGroup(groupAlias, { smids, isith });
      await wallet.wait(op);
    })
  );
});

test("First two members creates registry", async () => {
  await Promise.all(
    [wallet1, wallet2].map(async (wallet) => {
      const op = await wallet.createRegistry({ name: groupAlias, registryName, nonce: registryNonce });
      await wallet.wait(op);
    })
  );

  const registry = await wallet1.client.registries().list(groupAlias);
  regk = registry.regk;
});

test("Last member creates multisig group after some delay", async () => {
  const smids = wallets.map((w) => w.identifier.prefix);
  const op = await wallet3.createGroup(groupAlias, { smids, isith });
  await wallet3.wait(op);
});

test("Last member creates registry", async () => {
  const op = await wallet3.createRegistry({ name: groupAlias, registryName, nonce: registryNonce });
  await wallet3.wait(op, { signal: AbortSignal.timeout(5000), onRetry: (op) => console.dir(op, { depth: 100 }) });
});
