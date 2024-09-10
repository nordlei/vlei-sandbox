import { beforeAll, expect, test } from "vitest";
import { randomUUID } from "crypto";
import { TestWallet } from "../test-wallet.ts";

const wallet1 = new TestWallet({
  alias: "alias1",
});

const wallet2 = new TestWallet({
  alias: "alias2",
});

beforeAll(async () => {
  await Promise.all([wallet1.init(), wallet2.init()]);
});

test("Resolve OOBIs", async () => {
  await wallet1.resolveOobi(await wallet2.generateOobi(), wallet2.identifier.name);

  expect(await wallet1.client.contacts().get(wallet2.identifier.prefix)).toMatchObject({
    id: wallet2.identifier.prefix,
    alias: wallet2.identifier.name,
  });
});

test("Update contact details, query key state", async () => {
  const group = randomUUID();
  await wallet1.client.contacts().update(wallet2.identifier.prefix, { group });
  await wallet1.queryKeyState(wallet2.identifier.prefix);

  expect(await wallet1.client.contacts().get(wallet2.identifier.prefix)).toMatchObject({
    id: wallet2.identifier.prefix,
    alias: wallet2.identifier.name,
    group,
  });
});

test("Update contact details, re-resolve OOBI", async () => {
  const group = randomUUID();
  await wallet1.client.contacts().update(wallet2.identifier.prefix, { group });
  await wallet1.resolveOobi(await wallet2.generateOobi(), wallet2.identifier.name);

  expect(await wallet1.client.contacts().get(wallet2.identifier.prefix)).toMatchObject({
    id: wallet2.identifier.prefix,
    alias: wallet2.identifier.name,
    group,
  });
});

test("Update contact details, re-resolve OOBI, query key state", async () => {
  const group = randomUUID();
  await wallet1.client.contacts().update(wallet2.identifier.prefix, { group });
  await wallet1.resolveOobi(await wallet2.generateOobi(), wallet2.identifier.name);
  await wallet1.queryKeyState(wallet2.identifier.prefix);

  expect(await wallet1.client.contacts().get(wallet2.identifier.prefix)).toMatchObject({
    id: wallet2.identifier.prefix,
    alias: wallet2.identifier.name,
    group,
  });
});
