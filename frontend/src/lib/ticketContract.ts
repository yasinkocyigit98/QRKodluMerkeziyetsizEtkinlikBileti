import {
    Address,
    BASE_FEE,
    Contract,
    TransactionBuilder,
    rpc,
    scValToNative,
} from "@stellar/stellar-sdk";
import { getAddress, isConnected, signTransaction } from "@stellar/freighter-api";
import { config, rpc as rpcServer } from "./stellar";

const CONTRACT_ID = import.meta.env.VITE_TICKET_CONTRACT_ID ?? "";
const TX_POLL_INTERVAL_MS = 2000;
const TX_POLL_ATTEMPTS = 30;

function getTicketContract(): Contract {
    if (!CONTRACT_ID) {
        throw new Error("VITE_TICKET_CONTRACT_ID frontend/.env içinde tanımlı değil.");
    }

    return new Contract(CONTRACT_ID);
}

function addressToScVal(address: string) {
    return Address.fromString(address).toScVal();
}

async function getWalletAddress(): Promise<string> {
    const connected = await isConnected();
    if (!connected.isConnected) {
        throw new Error("Lütfen Freighter cüzdanınızı bağlayın.");
    }

    const addressRes = await getAddress();
    if (addressRes.error || !addressRes.address) {
        throw new Error(addressRes.error?.message || "Cüzdan adresi alınamadı.");
    }

    return addressRes.address;
}

export async function buyEventTicket(): Promise<string> {
    const userAddress = await getWalletAddress();
    const account = await rpcServer.getAccount(userAddress);
    const contract = getTicketContract();

    const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: config.networkPassphrase,
    })
        .addOperation(contract.call("buy_ticket", addressToScVal(userAddress)))
        .setTimeout(30)
        .build();

    const sim = await rpcServer.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
        throw new Error(`Satın alma simülasyon hatası: ${sim.error}`);
    }

    const assembledTx = rpc.assembleTransaction(tx, sim).build();
    const signRes = await signTransaction(assembledTx.toXDR(), {
        networkPassphrase: config.networkPassphrase,
    });

    if (signRes.error || !signRes.signedTxXdr) {
        throw new Error(signRes.error?.message || "İmza alınamadı.");
    }

    const signedTx = TransactionBuilder.fromXDR(signRes.signedTxXdr, config.networkPassphrase);
    const result = await rpcServer.sendTransaction(signedTx);
    if (result.status === "ERROR") {
        throw new Error(`İşlem ağa gönderilemedi: ${result.errorResult}`);
    }

    await pollTransactionStatus(result.hash);
    return result.hash;
}

export async function verifyTicket(userAddress: string): Promise<boolean> {
    if (!userAddress) {
        throw new Error("Bilet doğrulamak için cüzdan adresi gerekli.");
    }

    const contract = getTicketContract();
    const account = await rpcServer.getAccount(userAddress);

    const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: config.networkPassphrase,
    })
        .addOperation(contract.call("has_ticket", addressToScVal(userAddress)))
        .setTimeout(30)
        .build();

    const sim = await rpcServer.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
        throw new Error(`Bilet sorgusu simülasyon hatası: ${sim.error}`);
    }

    if (!sim.result) {
        return false;
    }

    return Boolean(scValToNative(sim.result.retval));
}

export async function checkInUser(userAddressToCheck: string): Promise<string> {
    if (!userAddressToCheck) {
        throw new Error("Kullanılacak bilet için cüzdan adresi gerekli.");
    }

    const adminAddress = await getWalletAddress();
    const account = await rpcServer.getAccount(adminAddress);
    const contract = getTicketContract();

    const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: config.networkPassphrase,
    })
        .addOperation(
            contract.call(
                "check_in",
                addressToScVal(adminAddress),
                addressToScVal(userAddressToCheck)
            )
        )
        .setTimeout(30)
        .build();

    const sim = await rpcServer.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
        throw new Error(`Check-in simülasyon hatası: ${sim.error}`);
    }

    const assembledTx = rpc.assembleTransaction(tx, sim).build();
    const signRes = await signTransaction(assembledTx.toXDR(), {
        networkPassphrase: config.networkPassphrase,
    });

    if (signRes.error || !signRes.signedTxXdr) {
        throw new Error(signRes.error?.message || "İmza alınamadı.");
    }

    const signedTx = TransactionBuilder.fromXDR(signRes.signedTxXdr, config.networkPassphrase);
    const result = await rpcServer.sendTransaction(signedTx);
    if (result.status === "ERROR") {
        throw new Error(`İşlem ağa gönderilemedi: ${result.errorResult}`);
    }

    await pollTransactionStatus(result.hash);
    return result.hash;
}

async function pollTransactionStatus(hash: string): Promise<void> {
    let status = await rpcServer.getTransaction(hash);

    for (let attempt = 0; status.status === "NOT_FOUND" && attempt < TX_POLL_ATTEMPTS; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, TX_POLL_INTERVAL_MS));
        status = await rpcServer.getTransaction(hash);
    }

    if (status.status !== "SUCCESS") {
        throw new Error("Blockchain işlemi başarısız oldu veya zaman aşımına uğradı.");
    }
}
