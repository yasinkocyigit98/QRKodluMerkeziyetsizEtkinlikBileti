import { useState } from 'react';
import QRCode from 'react-qr-code';
import { getAddress, getNetwork, isConnected, setAllowed } from '@stellar/freighter-api';
import { buyEventTicket, verifyTicket, checkInUser } from '../lib/ticketContract';
import { config } from '../lib/stellar';
import styles from './TicketApp.module.css';

export default function TicketApp() {
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [myAddress, setMyAddress] = useState('');
    const [hasTicketStatus, setHasTicketStatus] = useState<boolean | null>(null);

    const fetchAddress = async () => {
        setLoading(true);
        setMessage('');

        try {
            const connected = await isConnected();
            if (!connected.isConnected) {
                throw new Error('Freighter extension was not found or is not enabled.');
            }

            const allowed = await setAllowed();
            if (allowed.error || !allowed.isAllowed) {
                throw new Error(allowed.error?.message || 'Wallet permission was not granted.');
            }

            const network = await getNetwork();
            if (network.error) {
                throw new Error(network.error.message);
            }

            if (network.networkPassphrase !== config.networkPassphrase) {
                throw new Error('Please switch Freighter to the Stellar Testnet network.');
            }

            const res = await getAddress();
            if (res.error || !res.address) {
                throw new Error(res.error?.message || 'Wallet address could not be read.');
            }

            setMyAddress(res.address);
            setHasTicketStatus(null);
            setMessage('Wallet connected successfully.');
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Connection failed.';
            setMessage(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const handleBuyTicket = async () => {
        setLoading(true);
        setMessage('Buying ticket. Please approve the transaction in Freighter...');

        try {
            await buyEventTicket();
            setMessage('Success: ticket purchased.');
            setHasTicketStatus(true);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Transaction failed.';
            setMessage(`Error: ${errorMessage}`);
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyDoor = async () => {
        if (!myAddress) return;

        setLoading(true);
        setMessage('Checking ticket on the network...');

        try {
            const status = await verifyTicket(myAddress);
            setHasTicketStatus(status);
            setMessage(status ? 'Success: valid ticket. Entry approved.' : 'Invalid ticket: no active record was found.');
        } catch (error: unknown) {
            setMessage('Ticket verification failed.');
        } finally {
            setLoading(false);
        }
    };

    const handleCheckIn = async () => {
        if (!myAddress) return;
        setLoading(true);
        setMessage('Marking ticket as used...');

        try {
            await checkInUser(myAddress);
            setMessage('Success: check-in completed. The ticket is now invalid.');
            setHasTicketStatus(false);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Check-in failed.';
            setMessage(`Error: ${errorMessage}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h2>Decentralized Event Ticket</h2>
            </header>

            {!myAddress ? (
                <button onClick={fetchAddress} disabled={loading} className={styles.btn}>
                    {loading ? 'Connecting...' : 'Connect Wallet'}
                </button>
            ) : (
                <div className={styles.ticketSection}>
                    <div className={styles.addressBox}>
                        <strong>Address:</strong> {myAddress.slice(0, 6)}...{myAddress.slice(-6)}
                    </div>

                    <div className={styles.actions}>
                        <button onClick={handleBuyTicket} disabled={loading} className={styles.btnAction}>
                            Buy Ticket
                        </button>

                        <button onClick={handleVerifyDoor} disabled={loading} className={styles.btnDoor}>
                            Verify
                        </button>

                        <button onClick={handleCheckIn} disabled={loading} className={styles.btnCheckIn}>
                            Use Ticket
                        </button>
                    </div>

                    {hasTicketStatus && (
                        <div className={styles.qrContainer}>
                            <h3>Your Entry QR Code</h3>
                            <div className={styles.qrCode}>
                                <QRCode value={myAddress} size={160} bgColor="#ffffff" />
                            </div>
                            <p className={styles.hint}>Show this code at the entrance.</p>
                        </div>
                    )}
                </div>
            )}

            {message && (
                <div className={`${styles.alert} ${message.startsWith('Success:') ? styles.success : ''}`}>
                    {message}
                </div>
            )}
        </div>
    );
}
