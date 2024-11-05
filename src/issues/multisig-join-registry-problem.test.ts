import { beforeAll, describe, expect, test } from "vitest";
import { TestWallet } from "../test-wallet.ts";
import { createTimestamp, introduce } from "../test-utils.ts";
import { b, Serder } from "signify-ts";

let wallets: TestWallet[];

const groupAlias = "group";
const registryName = "vlei";
let registryNonce: string;
let wits: string[];
let toad: number;

beforeAll(async () => {
  wallets = Array.from({ length: 2 }).map(
    (_, idx) =>
      new TestWallet({
        alias: `member${(idx + 1).toString().padStart(2, "0")}`,
      })
  );
  await Promise.all(wallets.map((w) => w.init()));
  registryNonce = TestWallet.randomNonce();
  wits = process.env.WITNESS_IDS?.split(";") ?? [];
  toad = Math.min(wits.length, Math.max(wits.length - 1, 0));
});

describe("join multisig group with credential registry", () => {
  test("resolve all OOBIs", async () => {
    await introduce(wallets);
  });

  test("multisig members create multisig group", async () => {
    const smids = wallets.map((w) => w.identifier.prefix);
    const isith = wallets.length;

    await Promise.all(
      wallets.map(async (wallet) => {
        const operation = await wallet.createGroup(groupAlias, {
          smids,
          isith,
          wits,
          toad,
        });
        await wallet.wait(operation, {
          signal: AbortSignal.timeout(10_000),
        });
      })
    );
  });

  test("multisig members create agent endroles", async () => {
    const dt = createTimestamp();
    await Promise.all(
      wallets.map(async (wallet) => {
        await Promise.all(
          wallets.map(async (agentWallet) => {
            const operation = await wallet.addEndRole(
              groupAlias,
              dt,
              agentWallet.client.agent!.pre
            );
            await wallet.wait(operation, {
              signal: AbortSignal.timeout(10_000),
            });
          })
        );
      })
    );
  });

  test("multisig creates registry", async () => {
    const results = await Promise.all(
      wallets.map(async (wallet) => {
        const operation = await wallet.createRegistry({
          name: groupAlias,
          registryName,
          nonce: registryNonce,
        });
        return wallet.wait(operation, {
          signal: AbortSignal.timeout(10_000),
        });
      })
    );

    const [registry] = await wallets[0].client.registries().list(groupAlias);
    expect(registry).toHaveProperty("regk");
  });

  describe("new multisig member", () => {
    let allWallets: TestWallet[];
    let newWallet: TestWallet;

    beforeAll(async () => {
      newWallet = new TestWallet({
        alias: `newMember`,
      });
      await newWallet.init();

      allWallets = [...wallets, newWallet];
    });

    test("resolve all oobis", async () => {
      await introduce(allWallets);
    });

    test("multisig members rotate their own identifiers", async () => {
      await Promise.all(
        wallets.map(async (wallet) => {
          const operation = await wallet.rotateIdentifier({
            identifierAlias: wallet.identifier.name,
          });
          await wallet.wait(operation, {
            signal: AbortSignal.timeout(10_000),
          });
          await wallet.refreshIdentifier();
        })
      );
    });

    test("multisig rotates in a new member, to next keys", async () => {
      const newMemberStates = allWallets.map(
        (wallet) => wallet.identifier.state
      );

      await Promise.all(
        wallets.map(async (wallet) => {
          const operation = await wallet.rotateIdentifier({
            identifierAlias: groupAlias,
            rotationStates: newMemberStates,
          });
          await wallet.wait(operation, {
            signal: AbortSignal.timeout(20_000),
          });
        })
      );
    });

    test("multisig members rotate their own identifiers", async () => {
      await Promise.all(
        allWallets.map(async (wallet) => {
          await wallet.clearNotifications();
          const operation = await wallet.rotateIdentifier({
            identifierAlias: wallet.identifier.name,
          });
          await wallet.wait(operation, {
            signal: AbortSignal.timeout(10_000),
          });
          await wallet.refreshIdentifier();
        })
      );
    });

    test("multisig rotates in a new member, to signing keys", async () => {
      const newMemberStates = allWallets.map(
        (wallet) => wallet.identifier.state
      );

      await Promise.all(
        wallets.map(async (wallet) => {
          const operation = await wallet.rotateIdentifier({
            identifierAlias: groupAlias,
            rotationStates: newMemberStates,
          });
          await wallet.wait(operation, {
            signal: AbortSignal.timeout(20_000),
          });
        })
      );
    });

    test("new member joins group", async () => {
      const rotationNotification = await newWallet.waitNotification(
        "/multisig/rot",
        AbortSignal.timeout(20_000)
      );

      const exchangeResult = await newWallet.client
        .exchanges()
        .get(rotationNotification.a.d);

      const { exn } = exchangeResult;

      await newWallet.resolveOobi(
        (await wallets[0].generateOobi(groupAlias)).split("/agent/")[0],
        groupAlias
      );

      const serder = new Serder(exn.e.rot);
      const keeper = newWallet.client.manager!.get(newWallet.identifier);
      const sigs = keeper.sign(b(serder.raw));

      const joinOperation = await newWallet.client
        .groups()
        .join(groupAlias, serder, sigs, exn.a.gid, exn.a.smids, exn.a.rmids);

      await newWallet.wait(joinOperation, {
        signal: AbortSignal.timeout(20_000),
      });
    });

    test("new member list group registry", async () => {
      const registry = await newWallet.client.registries().list(groupAlias);
      expect(registry.length).toBe(1);
    });
  });
});
