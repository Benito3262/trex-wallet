import React, { useState } from "react";
import { ScrollView, Text } from "react-native";
import type { EvmNetwork } from "../config/networks";
import { unlockAccount } from "../wallet/vault";
import { afterPaint } from "../utils/defer";
import { recordTransaction } from "../wallet/history";
import { prepareErc20Transfer, sendErc20Transfer } from "../wallet/erc20Transactions";
import type { Erc20TransferPreview } from "../wallet/erc20Transactions";
import type { TokenMetadata } from "../wallet/tokens";
import { parseRecipientQr, recipientWarnings } from "../scan/qr";
import { BottomSheet, FadeIn, SheetScrollView, useLingering } from "./motion";
import { QrScanner } from "./QrScanner";
import { AddressField, Card, Detail, Disclaimer, ErrorText, Field, FieldLabel, GhostButton, PrimaryButton, ScreenHeader, WarningPanel, ui } from "./ui";

export function SendToken({ address, network, token, onBack, onSent }: {
  address: string;
  network: EvmNetwork;
  token: TokenMetadata;
  onBack: () => void;
  onSent: (hash: string) => void;
}) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [preview, setPreview] = useState<Erc20TransferPreview | null>(null);
  const shownPreview = useLingering(preview);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanNotes, setScanNotes] = useState<string[]>([]);

  async function review() {
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      setPreview(await prepareErc20Transfer(network, address, token, recipient, amount));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to prepare this token transfer.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmAndSend() {
    if (busy) return;
    setBusy(true);
    setError("");
    await afterPaint();
    try {
      const { signer: wallet } = await unlockAccount(undefined, "Authenticate to sign this transfer");
      if (wallet.address.toLowerCase() !== address.toLowerCase()) throw new Error("The active account changed. Reopen this screen and try again.");
      const hash = await sendErc20Transfer(network, wallet, token, recipient, amount);
      try {
        await recordTransaction({
          hash,
          chainId: network.chainId,
          networkName: network.name,
          symbol: token.symbol,
          amount: amount.trim(),
          toAddress: recipient.trim(),
          fromAddress: wallet.address,
          createdAt: new Date().toISOString(),
          status: "submitted"
        });
      } catch {
        // Do not misreport a broadcast transaction if local history storage fails.
      }
      setPreview(null);
      onSent(hash);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The token transfer was not sent.");
    } finally {
      setBusy(false);
    }
  }

  function onScanned(data: string): string | null {
    try {
      const scan = parseRecipientQr(data);
      setRecipient(scan.address);
      setPreview(null);
      setScanNotes(recipientWarnings(scan, { chainId: network.chainId, chainName: network.name, tokenContract: token.contractAddress }));
      setScanning(false);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Could not read this QR code.";
    }
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader kicker="SEND TOKEN" title={`Send ${token.symbol}`} onBack={onBack} />
      <FadeIn delay={60}>
        <Text style={ui.body}>Send this ERC-20 token on {network.name}. The contract was added manually and has not been verified by TREX.</Text>
        <FieldLabel>RECIPIENT ADDRESS</FieldLabel>
        <AddressField value={recipient} onChangeText={(v) => { setRecipient(v); setPreview(null); setScanNotes([]); }} onScan={() => setScanning(true)} />
        {scanNotes.map((note) => <WarningPanel key={note} title="Check the scanned code">{note}</WarningPanel>)}
        <FieldLabel>AMOUNT ({token.symbol})</FieldLabel>
        <Field value={amount} onChangeText={(v) => { setAmount(v); setPreview(null); }} keyboardType="decimal-pad" placeholder="0.00" />
        <PrimaryButton label="REVIEW TOKEN TRANSFER" busyLabel="CHECKING TOKEN AND NETWORK…" busy={busy && !preview} disabled={!recipient || !amount} onPress={review} />
      </FadeIn>
      {!preview && <ErrorText message={error} />}
      <Disclaimer>TESTNET ONLY · VERIFY TOKEN CONTRACTS YOURSELF</Disclaimer>

      <BottomSheet visible={!!preview} onClose={() => { if (!busy) setPreview(null); }} dismissable={!busy} scrollable>
        {shownPreview && (
          <SheetScrollView>
            <Text style={ui.sheetKicker}>REVIEW TOKEN TRANSFER</Text>
            <Text style={ui.sheetTitle}>Review carefully</Text>
            <Card>
              <Detail label="TOKEN CONTRACT" value={shownPreview.contractAddress} />
              <Detail label="RECIPIENT" value={shownPreview.recipient} />
              <Detail label="TOKEN AMOUNT" value={`${shownPreview.amount} ${shownPreview.symbol}`} emphasis />
              <Detail label="ESTIMATED NETWORK FEE" value={`${Number(shownPreview.networkFee).toFixed(8)} ${network.symbol}`} />
              <Detail label="NETWORK" value={`${network.name} · Chain ${network.chainId}`} />
            </Card>
            <WarningPanel title="Unverified contract">
              TREX checks the contract code, token balance, decimals, symbol, chain and gas estimate. It does not verify that this token is legitimate or valuable. Verify the contract and recipient yourself. Transfers are normally irreversible.
            </WarningPanel>
            <ErrorText message={error} />
            <PrimaryButton label="CONFIRM AND SEND" busyLabel="AUTHENTICATING…" busy={busy} onPress={confirmAndSend} />
            <GhostButton label="EDIT TRANSFER" onPress={() => setPreview(null)} disabled={busy} />
          </SheetScrollView>
        )}
      </BottomSheet>
      <QrScanner visible={scanning} title="Scan address" hint="Point the camera at a recipient's address QR or ethereum: payment code." onScan={onScanned} onClose={() => setScanning(false)} />
    </ScrollView>
  );
}
