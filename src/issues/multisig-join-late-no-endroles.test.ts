import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { KERIA_HOSTNAME, TestWallet } from "../test-wallet.ts";
import { createTimestamp } from "../test-utils.ts";

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

afterAll(async () => {
  console.log(wallets.map((w, idx) => `MEMBER_${(idx + 1).toString().padStart(2, "0")}="${w.client.bran}"`).join("\n"));
});

test("Resolve OOBIs", async () => {
  for (const wallet of [wallet1, wallet2, wallet3]) {
    for (const other of wallets) {
      if (other.identifier.prefix !== wallet.identifier.prefix) {
        await wallet.resolveOobi(await other.generateOobi(), other.identifier.name);
      }
    }

    expect(await wallet.client.contacts().list()).toHaveLength(2);
  }
});

test("First two members create multisig group", async () => {
  const smids = wallets.map((w) => w.identifier.prefix).slice(0, 3);

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
      const op2 = await wallet.addEndRole(groupAlias, dt, wallet2.client.agent!.pre);
      return Promise.all([op1, op2].map((o) => wallet.wait(o, { signal: AbortSignal.timeout(20000) })));
    })
  );
});

test.skip("Last member creates multisig group after some delay", async () => {
  const smids = wallets.map((w) => w.identifier.prefix);
  const op = await wallet3.createGroup(groupAlias, { smids, isith, wits, toad });
  await wallet3.wait(op);
});

test("Verify oobi contains end roles", async () => {
  const oobi = await wallet1.generateOobi(groupAlias);
  const url = new URL(oobi);
  url.hostname = KERIA_HOSTNAME;

  console.log(await fetch(url).then((r) => r.text()));
});
