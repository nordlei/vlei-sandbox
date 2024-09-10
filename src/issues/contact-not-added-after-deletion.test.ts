import { beforeAll, expect, test } from "vitest";
import { TestWallet } from "../test-wallet.ts";
import { randomUUID } from "crypto";

const wallet1 = new TestWallet({
  alias: "alias1",
});

const wallet2 = new TestWallet({
  alias: "alias2",
});

beforeAll(async () => {
  await Promise.all([wallet1.init(), wallet2.init()]);
});

test("Resolve OOBI, verify contact", async () => {
  let operation = await wallet1.client.oobis().resolve(await wallet2.generateOobi(), wallet2.identifier.name);
  operation = await wallet1.client.operations().wait(operation);

  expect(operation).toMatchObject({ done: true });

  expect(await wallet1.client.contacts().get(wallet2.identifier.prefix)).toMatchObject({
    id: wallet2.identifier.prefix,
    alias: wallet2.identifier.name,
  });
});

test("Delete contact, resolve OOBI, get contact", async () => {
  await wallet1.client.contacts().delete(wallet2.identifier.prefix);

  let operation = await wallet1.client.oobis().resolve(await wallet2.generateOobi(), wallet2.identifier.name);
  operation = await wallet1.client.operations().wait(operation);

  expect(operation).toMatchObject({ done: true });

  // Need to add this sleep for the contact to become available, even though the operation is finished
  // await sleep(1000);

  expect(await wallet1.client.contacts().get(wallet2.identifier.prefix)).toMatchObject({
    id: wallet2.identifier.prefix,
    alias: wallet2.identifier.name,
  });
});
