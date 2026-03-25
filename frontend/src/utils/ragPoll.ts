import { fetchRagStatus } from "../services/api";

/** Poll until FAISS index exists or timeout (first embedding download can take minutes). */
export async function waitForRagIndex(
  docId: string,
  maxMs = 180000
): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const { ready } = await fetchRagStatus(docId);
    if (ready) return true;
    await new Promise((r) => setTimeout(r, 900));
  }
  return false;
}
