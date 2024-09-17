export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createTimestamp() {
  const dt = new Date().toISOString().replace("Z", "000+00:00");
  return dt;
}
