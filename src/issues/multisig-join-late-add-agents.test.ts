import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { TestWallet } from "../test-wallet.ts";
import { createTimestamp } from "../test-utils.ts";

const wallets = Array.from({ length: 3 }).map(
  (_, idx) => new TestWallet({ alias: `member${(idx + 1).toString().padStart(2, "0")}` })
);

const [wallet1, wallet2, wallet3] = wallets;
const isith = wallets.length - 1;

const groupAlias = "group";

beforeAll(async () => {
  await Promise.all(wallets.map((w) => w.init()));
});

afterAll(async () => {
  for (const wallet of wallets) {
    const group = await wallet.client.identifiers().get(groupAlias);

    console.log(`Group state for ${wallet.identifier.name}:`, await wallet.client.keyStates().get(group.prefix));
  }
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

const dt = createTimestamp();

test("First two members create agent endrole", async () => {
  const smids = wallets.map((w) => w.identifier.prefix);

  await Promise.all(
    [wallet1, wallet2].map(async (wallet) => {
      const op = await wallet.configureGroupAgents(groupAlias, dt);
      return Promise.all(op.map((o) => wallet.wait(o, { signal: AbortSignal.timeout(20000) })));
    })
  );
});

test("Last member creates multisig group after some delay", async () => {
  const smids = wallets.map((w) => w.identifier.prefix);
  const op = await wallet3.createGroup(groupAlias, { smids, isith });
  await wallet3.wait(op);
});

test("Ensure group AID is the same", async () => {
  const group1 = await wallet1.client.identifiers().get(groupAlias);
  const group2 = await wallet2.client.identifiers().get(groupAlias);
  const group3 = await wallet3.client.identifiers().get(groupAlias);
  expect(group1.prefix).toEqual(group2.prefix);
  expect(group1.prefix).toEqual(group3.prefix);
});

// Enable to run multisig query
describe.skip("Query", () => {
  test("First member does multisig query", async () => {
    const group = await wallet1.client.identifiers().get(groupAlias);
    await wallet1.queryKeyState(group.prefix, { sn: "0", signal: AbortSignal.timeout(10000) });
  });

  test("Last member does multisig query", async () => {
    const group = await wallet3.client.identifiers().get(groupAlias);
    await wallet3.queryKeyState(group.prefix, { sn: "0", signal: AbortSignal.timeout(10000) });
  });
});

test("Last member creates agent endroles", async () => {
  const op = await wallet3.configureGroupAgents(groupAlias, dt);
  await Promise.all(
    op.map((o) =>
      wallet3.wait(o, { signal: AbortSignal.timeout(20000), onRetry: (op) => console.dir(op, { depth: 100 }) })
    )
  );
});
