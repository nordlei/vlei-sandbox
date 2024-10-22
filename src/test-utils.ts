import { TestWallet } from "./test-wallet";

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createTimestamp() {
  const dt = new Date().toISOString().replace("Z", "000+00:00");
  return dt;
}

export function formatMemberVariables(wallets: TestWallet[]) {
  return wallets.map((w, idx) => `MEMBER_${(idx + 1).toString().padStart(2, "0")}="${w.client.bran}"`).join("\n");
}

export async function introduce(wallets: TestWallet[]) {
  for (const wallet of wallets) {
    for (const other of wallets) {
      if (other.identifier.prefix !== wallet.identifier.prefix) {
        await wallet.resolveOobi(await other.generateOobi(), other.identifier.name);
      }
    }
  }
}
