import {
  BASE_FEE,
  Contract,
  TransactionBuilder,
  rpc as StellarRpc,
  scValToNative,
} from "@stellar/stellar-sdk";
import { signTransaction } from "@stellar/freighter-api";
import { config, rpc } from "./stellar";

export const COUNTER_CONTRACT_ID =
  import.meta.env.VITE_COUNTER_CONTRACT_ID ?? "";

const TX_POLL_INTERVAL_MS = 2000;
const TX_POLL_ATTEMPTS = 30;

function getCounterContract(): Contract {
  if (!COUNTER_CONTRACT_ID) {
    throw new Error("VITE_COUNTER_CONTRACT_ID frontend/.env içinde tanımlı değil.");
  }

  return new Contract(COUNTER_CONTRACT_ID);
}

async function buildTx(userAddress: string, method: string) {
  const account = await rpc.getAccount(userAddress);
  const contract = getCounterContract();

  return new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(contract.call(method))
    .setTimeout(30)
    .build();
}

export async function getCount(userAddress: string): Promise<number> {
  const tx = await buildTx(userAddress, "get_count");
  const sim = await rpc.simulateTransaction(tx);

  if (StellarRpc.Api.isSimulationError(sim)) {
    throw new Error(`Simülasyon hatası: ${sim.error}`);
  }

  if (!sim.result) {
    return 0;
  }

  return Number(scValToNative(sim.result.retval));
}

async function invokeAndWait(
  userAddress: string,
  method: "increment" | "decrement"
): Promise<number> {
  const tx = await buildTx(userAddress, method);
  const sim = await rpc.simulateTransaction(tx);

  if (StellarRpc.Api.isSimulationError(sim)) {
    throw new Error(`Simülasyon hatası: ${sim.error}`);
  }

  const assembled = StellarRpc.assembleTransaction(tx, sim).build();
  const signRes = await signTransaction(assembled.toXDR(), {
    networkPassphrase: config.networkPassphrase,
  });

  if (signRes.error || !signRes.signedTxXdr) {
    throw new Error(signRes.error?.message || "İşlem reddedildi.");
  }

  const signed = TransactionBuilder.fromXDR(
    signRes.signedTxXdr,
    config.networkPassphrase
  );

  const response = await rpc.sendTransaction(signed);
  if (response.status === "ERROR") {
    throw new Error(`İşlem ağa gönderilemedi: ${response.errorResult}`);
  }

  let result = await rpc.getTransaction(response.hash);
  for (
    let attempt = 0;
    result.status === "NOT_FOUND" && attempt < TX_POLL_ATTEMPTS;
    attempt += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, TX_POLL_INTERVAL_MS));
    result = await rpc.getTransaction(response.hash);
  }

  if (result.status !== "SUCCESS" || !result.returnValue) {
    throw new Error("İşlem başarısız oldu veya zaman aşımına uğradı.");
  }

  return Number(scValToNative(result.returnValue));
}

export const increment = (address: string) => invokeAndWait(address, "increment");
export const decrement = (address: string) => invokeAndWait(address, "decrement");
