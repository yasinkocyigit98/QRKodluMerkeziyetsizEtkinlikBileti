import { useState } from 'react';
import QRCode from 'react-qr-code';
import { getAddress, getNetwork, isConnected, setAllowed } from '@stellar/freighter-api';
// Lib içindeki fonksiyonların export edildiğinden emin ol
import { buyEventTicket, verifyTicket, checkInUser } from '../lib/ticketContract';
import { config } from '../lib/stellar';
import styles from './TicketApp.module.css';

export default function TicketApp() {
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [myAddress, setMyAddress] = useState('');
    const [hasTicketStatus, setHasTicketStatus] = useState<boolean | null>(null);

    /**
     * Cüzdan Bağlantısı ve Yetkilendirme
     */
    const fetchAddress = async () => {
        setLoading(true);
        setMessage('');

        try {
            const connected = await isConnected();
            if (!connected.isConnected) {
                throw new Error('Freighter eklentisi bulunamadı veya etkin değil.');
            }

            const allowed = await setAllowed();
            if (allowed.error || !allowed.isAllowed) {
                throw new Error(allowed.error?.message || 'Cüzdan izni verilmedi.');
            }

            const network = await getNetwork();
            if (network.error) {
                throw new Error(network.error.message);
            }

            // Ağ kontrolü (Testnet mi?)
            if (network.networkPassphrase !== config.networkPassphrase) {
                throw new Error('Lütfen Freighter ağını Testnet olarak değiştirin.');
            }

            const res = await getAddress();
            if (res.error || !res.address) {
                throw new Error(res.error?.message || 'Adres alınamadı.');
            }

            setMyAddress(res.address);
            setHasTicketStatus(null);
            setMessage('Cüzdan başarıyla bağlandı.');
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Bağlantı hatası.';
            setMessage(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    /**
     * Akıllı Sözleşmeden Bilet Satın Alma
     */
    const handleBuyTicket = async () => {
        setLoading(true);
        setMessage('Bilet alınıyor, lütfen cüzdanınızdan onay verin...');

        try {
            await buyEventTicket();
            setMessage('✅ Tebrikler! Bilet başarıyla alındı.');
            setHasTicketStatus(true);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'İşlem başarısız.';
            setMessage(`Hata: ${errorMessage}`);
        } finally {
            setLoading(false);
        }
    };

    /**
     * Bileti Kapıda Doğrulama (Ücretsiz Okuma)
     */
    const handleVerifyDoor = async () => {
        if (!myAddress) return;

        setLoading(true);
        setMessage('Ağdan sorgulanıyor...');

        try {
            const status = await verifyTicket(myAddress);
            setHasTicketStatus(status);
            setMessage(status ? '✅ Geçerli bilet: Giriş onaylandı!' : '❌ Geçersiz bilet: Kayıt bulunamadı.');
        } catch (error: unknown) {
            setMessage('Bilet sorgusu sırasında hata oluştu.');
        } finally {
            setLoading(false);
        }
    };

    /**
     * Bileti Kullan (Check-in) - Akıllı Sözleşmedeki Durumu Değiştirir
     */
    const handleCheckIn = async () => {
        if (!myAddress) return;
        setLoading(true);
        setMessage('Bilet kullanıldı olarak işaretleniyor...');

        try {
            await checkInUser(myAddress);
            setMessage('✅ Check-in başarılı! Bilet artık geçersiz.');
            setHasTicketStatus(false);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Check-in başarısız.';
            setMessage(`Hata: ${errorMessage}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h2>🎟️ Merkeziyetsiz Etkinlik Bileti</h2>
            </header>

            {!myAddress ? (
                <button onClick={fetchAddress} disabled={loading} className={styles.btn}>
                    {loading ? 'Bağlanıyor...' : 'Cüzdanı Bağla'}
                </button>
            ) : (
                <div className={styles.ticketSection}>
                    <div className={styles.addressBox}>
                        <strong>Adres:</strong> {myAddress.slice(0, 6)}...{myAddress.slice(-6)}
                    </div>

                    <div className={styles.actions}>
                        <button onClick={handleBuyTicket} disabled={loading} className={styles.btnAction}>
                            Bilet Al
                        </button>

                        <button onClick={handleVerifyDoor} disabled={loading} className={styles.btnDoor}>
                            Doğrula
                        </button>

                        <button onClick={handleCheckIn} disabled={loading} className={styles.btnCheckIn}>
                            Bileti Kullan
                        </button>
                    </div>

                    {hasTicketStatus && (
                        <div className={styles.qrContainer}>
                            <h3>Giriş QR Kodunuz</h3>
                            <div className={styles.qrCode}>
                                <QRCode value={myAddress} size={160} bgColor='#ffffff' />
                            </div>
                            <p className={styles.hint}>Bu kodu kapıdaki görevliye gösterin.</p>
                        </div>
                    )}
                </div>
            )}

            {message && (
                <div className={`${styles.alert} ${message.includes('✅') ? styles.success : ''}`}>
                    {message}
                </div>
            )}
        </div>
    );
}