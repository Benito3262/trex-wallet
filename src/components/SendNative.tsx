import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import type { EvmNetwork } from "../config/networks";
import { unlockAccount } from "../wallet/vault";
import { prepareNativeTransfer, sendNativeTransfer } from "../wallet/transactions";
import type { NativeTransferPreview } from "../wallet/transactions";
import { recordTransaction } from "../wallet/history";
import { parseRecipientQr, recipientWarnings } from "../scan/qr";
import { BottomSheet, FadeIn } from "./motion";
import { QrScanner } from "./QrScanner";
import { AddressField, Card, Detail, Disclaimer, ErrorText, Field, FieldLabel, GhostButton, PrimaryButton, ScreenHeader, SuccessCard, WarningPanel, ui } from "./ui";

export function SendNative({ address, network, onBack, onSent }: {
  address: string;
  network: EvmNetwork;
  onBack: () => void;
  onSent: (hash: string) => void;
}) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [preview, setPreview] = useState<NativeTransferPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hash, setHash] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanNotes, setScanNotes] = useState<string[]>([]);

  async function review() {
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      setPreview(await prepareNativeTransfer(network, address, recipient, amount));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to prepare this transfer.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmAndSend() {
    setBusy(true);
    setError("");
    try {
      const { signer: wallet } = await unlockAccount(undefined, "Authenticate to sign this transfer");
      if (wallet.address.toLowerCase() !== address.toLowerCase()) throw new Error("The active account changed. Reopen this screen and try again.");
      const txHash = await sendNativeTransfer(network, wallet, recipient, amount);
      try {
        await recordTransaction({
          hash: txHash,
          chainId: network.chainId,
          networkName: network.name,
          symbol: network.symbol,
          amount: amount.trim(),
          toAddress: recipient.trim(),
          fromAddress: wallet.address,
          createdAt: new Date().toISOString(),
          status: "submitted"
        });
      } catch {
        // The network submission succeeded; a local history write must not misreport it as failed.
      }
      setPreview(null);
      setHash(txHash);
      onSent(txHash);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The transaction was not sent.");
    } finally {
      setBusy(false);
    }
  }

  function onScanned(data: string): string | null {
    try {
      const scan = parseRecipientQr(data);
      setRecipient(scan.address);
      setPreview(null);
      setScanNotes(recipientWarnings(scan, { chainId: network.chainId, chainName: network.name }));
      setScanning(false);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Could not read this QR code.";
    }
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader kicker="SEND" title={`Send ${network.symbol}`} onBack={onBack} />
      {!hash ? (
        <FadeIn delay={60}>
          <Text style={ui.body}>Send the network's native asset. TREX estimates the fee and shows everything before you approve with biometrics.</Text>
          <FieldLabel>NETWORK</FieldLabel>
          <View style={ui.readOnly}><Text style={ui.readOnlyText}>{network.name} · Chain {network.chainId}</Text></View>
          <FieldLabel>RECIPIENT ADDRESS</FieldLabel>
          <AddressField value={recipient} onChangeText={(v) => { setRecipient(v); setPreview(null); setScanNotes([]); }} onScan={() => setScanning(true)} />
          {scanNotes.map((note) => <WarningPanel key={note} title="Check the scanned code">{note}</WarningPanel>)}
          <FieldLabel>AMOUNT ({network.symbol})</FieldLabel>
          <Field value={amount} onChangeText={(v) => { setAmount(v); setPreview(null); }} keyboardType="decimal-pad" placeholder="0.00" />
          <PrimaryButton label="REVIEW TRANSFER" busyLabel="CHECKING NETWORK…" busy={busy && !preview} disabled={!recipient || !amount} onPress={review} />
        </FadeIn>
      ) : (
        <SuccessCard title="Transaction submitted" body="Your transaction was sent to the network. It is not confirmed until the chain includes it in a block.">
          <Detail label="TRANSACTION HASH" value={hash} />
          <PrimaryButton label="DONE" onPress={onBack} />
        </SuccessCard>
      )}
      {!preview && <ErrorText message={error} />}
      <Disclaimer>EARLY TEST BUILD · TESTNET FUNDS ONLY</Disclaimer>

      <BottomSheet visible={!!preview} onClose={() => { if (!busy) setPreview(null); }} dismissable={!busy}>
        {preview && (
          <ScrollView>
            <Text style={ui.sheetKicker}>REVIEW TRANSFER</Text>
            <Text style={ui.sheetTitle}>Review carefully</Text>
            <Card>
              <Detail label="RECIPIENT" value={preview.to} />
              <Detail label="AMOUNT" value={`${preview.amount} ${preview.symbol}`} emphasis />
              <Detail label="ESTIMATED NETWORK FEE" value={`${Number(preview.estimatedNetworkFee).toFixed(8)} ${preview.symbol}`} />
              <Detail label="MAXIMUM TOTAL" value={`${Number(preview.totalMaximum).toFixed(8)} ${preview.symbol}`} />
              <Detail label="NETWORK" value={`${network.name} · Chain ${network.chainId}`} />
              <Detail label="SENDING FROM" value={address} />
            </Card>
            <WarningPanel title="Before you sign">
              {`Crypto transfers cannot normally be reversed. Check every character of the recipient. This preview checks the chain, address format, balance and gas estimate. ${preview.recipientIsContract ? "The recipient is a smart contract. Confirm it is meant to receive this asset." : "The recipient is not a contract."} These checks do not prove who owns the address or detect every scam.`}
            </WarningPanel>
            <ErrorText message={error} />
            <PrimaryButton label="CONFIRM AND SEND" busyLabel="AUTHENTICATING…" busy={busy} onPress={confirmAndSend} />
            <GhostButton label="EDIT TRANSFER" onPress={() => setPreview(null)} disabled={busy} />
          </ScrollView>
        )}
      </BottomSheet>
      <QrScanner visible={scanning} title="Scan address" hint="Point the camera at a recipient's address QR or ethereum: payment code." onScan={onScanned} onClose={() => setScanning(false)} />
    </ScrollView>
  );
}
