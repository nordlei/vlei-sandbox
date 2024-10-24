import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { TestWallet } from "../test-wallet.ts";
import { createTimestamp, formatMemberVariables } from "../test-utils.ts";

const wallets = Array.from({ length: 3 }).map(
  (_, idx) => new TestWallet({ alias: `member${(idx + 1).toString().padStart(2, "0")}` })
);

const [wallet1, wallet2, wallet3] = wallets;
const isith = wallets.length - 1;

const groupAlias = "group";
let wits: string[];
let toad: number;

beforeAll(async () => {
  await Promise.all(wallets.map((w) => w.init()));
  wits = process.env.WITNESS_IDS?.split(";") ?? [];
  toad = Math.min(wits.length, Math.max(wits.length - 1, 0));
});

afterAll(() => {
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

test("First two members create multisig group", async () => {
  const smids = wallets.map((w) => w.identifier.prefix);

  await Promise.all(
    [wallet1, wallet2].map(async (wallet) => {
      const op = await wallet.createGroup(groupAlias, {
        smids,
        isith,
        wits,
        toad,
      });
      await wallet.wait(op);
    })
  );
});

const dt = createTimestamp();

test("First two members create agent endrole", async () => {
  await Promise.all(
    [wallet1, wallet2].map(async (wallet) => {
      const op1 = await wallet.addEndRole(groupAlias, dt, wallet1.client.agent!.pre);
      await wallet.wait(op1, { signal: AbortSignal.timeout(20000) });
    })
  );
});

test("Last member creates multisig group after some delay", async () => {
  const smids = wallets.map((w) => w.identifier.prefix);
  const op = await wallet3.createGroup(groupAlias, { smids, isith, wits, toad });
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
// These are just steps to try and force the keria agent to collect the signatures of the multisig group
// so that member 3 can complete the operation below
describe.skip("Query", () => {
  test("Last member resolves group OOBI", async () => {
    const oobi = await wallet1.generateOobi(groupAlias);
    await wallet3.resolveOobi(oobi);
  });
});

test("Last member creates agent endrole", async () => {
  const op1 = await wallet3.addEndRole(groupAlias, dt, wallet1.client.agent!.pre);

  // Note, this OOBI resolution only works if you make some changes to keria, will report
  // const oobi = await wallet1.generateOobi(groupAlias);
  // await wallet3.resolveOobi(oobi);

  await wallet3.wait(op1, { signal: AbortSignal.timeout(20000) });
});
