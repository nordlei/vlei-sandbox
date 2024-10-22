import { afterAll, beforeAll, describe, test } from "vitest";
import { TestWallet } from "../test-wallet.ts";
import { formatMemberVariables, introduce, sleep } from "../test-utils.ts";
import { Operation } from "signify-ts";

const wallets = Array.from({ length: 2 }).map(
  (_, idx) => new TestWallet({ alias: `member${(idx + 1).toString().padStart(2, "0")}` })
);

const [wallet1, wallet2] = wallets;
const isith = wallets.length;

const groupAlias = "group";
const registryName = "reg";
let registryNonce: string;
let wits: string[];
let toad: number;

beforeAll(async () => {
  await Promise.all(wallets.map((w) => w.init()));
  registryNonce = TestWallet.randomNonce();
  wits = process.env.WITNESS_IDS?.split(";") ?? [];
  toad = Math.min(wits.length, Math.max(wits.length - 1, 0));
});

afterAll(() => {
  formatMemberVariables(wallets);
});

test("Resolve OOBIs", async () => {
  await introduce(wallets);
});

test("Members create multisig group", async () => {
  const smids = wallets.map((w) => w.identifier.prefix);

  await Promise.all(
    wallets.map(async (wallet) => {
      const op = await wallet.createGroup(groupAlias, { smids, isith, wits, toad });
      await wallet.wait(op);
    })
  );
});

describe("Create registry", () => {
  test("First member creates registry", async () => {
    await wallet1.createRegistry({ name: groupAlias, registryName, nonce: registryNonce });
  });

  test("Second member sleeps", async () => {
    await sleep(20_000);
  });

  test("Second member creates registry", async () => {
    await wallet2.createRegistry({ name: groupAlias, registryName, nonce: registryNonce });
  });

  test("Member 1 Wait", async () => {
    const operations = await wallet1.client.operations().list();
    await Promise.all(operations.filter((o) => !o.done).map((o) => wallet1.wait(o)));
  });

  test("Member 2 Wait", async () => {
    const operations = await wallet2.client.operations().list();
    await Promise.all(operations.filter((o) => !o.done).map((o) => wallet2.wait(o)));
  });
});
